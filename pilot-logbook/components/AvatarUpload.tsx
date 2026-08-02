"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveAvatar } from "@/lib/actions";

/**
 * Pick an image, then frame it. The crop happens in the browser and only the
 * cropped square is uploaded, so an 8 MB phone photo becomes a ~60 KB square
 * before it ever reaches the server — the size limit is about what you're
 * allowed to open, not what gets stored.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
/** Rendered size of the framing window, in CSS pixels. */
const VIEWPORT = 260;
/** Stored square, big enough for a retina profile picture and no bigger. */
const OUTPUT = 512;
const PAN_STEP = 12;

/** A server action that redirects throws this on the way out. */
function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

interface Loaded {
  url: string;
  image: HTMLImageElement;
  name: string;
}

export default function AvatarUpload({ hasPicture }: { hasPicture: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // The scale at which the image just covers the framing window.
  const baseScale = loaded
    ? VIEWPORT / Math.min(loaded.image.naturalWidth, loaded.image.naturalHeight)
    : 1;
  const scale = baseScale * zoom;
  const drawnW = loaded ? loaded.image.naturalWidth * scale : 0;
  const drawnH = loaded ? loaded.image.naturalHeight * scale : 0;

  /** Keep the frame covered — no empty corners. */
  const clamp = useCallback(
    (o: { x: number; y: number }) => ({
      x: Math.min(0, Math.max(VIEWPORT - drawnW, o.x)),
      y: Math.min(0, Math.max(VIEWPORT - drawnH, o.y)),
    }),
    [drawnW, drawnH]
  );

  useEffect(() => {
    setOffset((o) => clamp(o));
  }, [clamp]);

  useEffect(() => {
    return () => {
      if (loaded) URL.revokeObjectURL(loaded.url);
    };
  }, [loaded]);

  const reset = () => {
    if (loaded) URL.revokeObjectURL(loaded.url);
    setLoaded(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    if (!file) return;
    if (!TYPES.includes(file.type)) {
      setError("Profile picture must be a PNG, JPEG, WebP, or GIF.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That image is ${(file.size / 1e6).toFixed(1)} MB — the limit is 8 MB.`);
      e.target.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const base = VIEWPORT / Math.min(image.naturalWidth, image.naturalHeight);
      setLoaded({ url, image, name: file.name });
      setZoom(1);
      // Start centred.
      setOffset({
        x: (VIEWPORT - image.naturalWidth * base) / 2,
        y: (VIEWPORT - image.naturalHeight * base) / 2,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError("That file couldn't be read as an image.");
    };
    image.src = url;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!loaded) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clamp({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-PAN_STEP, 0],
      ArrowRight: [PAN_STEP, 0],
      ArrowUp: [0, -PAN_STEP],
      ArrowDown: [0, PAN_STEP],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setOffset((o) => clamp({ x: o.x + m[0], y: o.y + m[1] }));
  };

  const upload = async () => {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser can't render the crop.");
      // JPEG has no alpha, so give transparent PNGs something to sit on.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      ctx.imageSmoothingQuality = "high";
      const sx = -offset.x / scale;
      const sy = -offset.y / scale;
      const sSize = VIEWPORT / scale;
      ctx.drawImage(loaded.image, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      );
      if (!blob) throw new Error("Couldn't encode the cropped image.");

      const form = new FormData();
      form.append("avatar", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      await saveAvatar(form);
    } catch (err) {
      // saveAvatar always ends in redirect(), which surfaces here as a thrown
      // NEXT_REDIRECT after the router has already started navigating. That's
      // success, not a failure to report.
      if (isRedirect(err)) {
        reset();
        setBusy(false);
        return;
      }
      setBusy(false);
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  return (
    <div className="stack">
      <input
        ref={fileRef}
        type="file"
        name="avatar"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={onPick}
        aria-label="Choose a profile picture"
      />

      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}

      {loaded && (
        <div className="crop">
          <div
            className="crop-view"
            style={{ width: VIEWPORT, height: VIEWPORT }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            tabIndex={0}
            role="group"
            aria-label="Framing window — drag, or use the arrow keys, to move the picture"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={loaded.url}
              alt=""
              draggable={false}
              style={{
                width: drawnW,
                height: drawnH,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
            <span className="crop-mask" aria-hidden />
          </div>

          <div className="field" style={{ maxWidth: VIEWPORT }}>
            <label htmlFor="crop-zoom">Zoom</label>
            <input
              id="crop-zoom"
              type="range"
              min={1}
              max={4}
              step={0.02}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </div>

          <div className="page-actions" style={{ marginBottom: 0 }}>
            <button type="button" onClick={upload} disabled={busy}>
              {busy ? "Saving…" : hasPicture ? "Replace Picture" : "Use This Picture"}
            </button>
            <button type="button" className="btn-secondary" onClick={reset} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
