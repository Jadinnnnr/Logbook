"use client";

import { useState } from "react";
import { ACCENTS, CUSTOM_ACCENT } from "@/lib/theme";
import { deriveAccent } from "@/lib/color";

/**
 * Accent swatches plus a free colour picker. Selecting anything previews it
 * across the page immediately by writing the same custom properties the saved
 * theme uses; the form still has to be submitted to persist it.
 */
export default function AccentPicker({
  accent,
  customHex,
}: {
  accent: string;
  customHex: string;
}) {
  const [selected, setSelected] = useState(accent);
  const [hex, setHex] = useState(customHex);
  const derived = deriveAccent(hex);

  function previewPreset(value: string) {
    setSelected(value);
    // Clear the inline overrides so the stylesheet's palette takes over again.
    const root = document.documentElement;
    for (const prop of ["--a-light", "--a-light-hover", "--a-dark", "--a-dark-hover"]) {
      root.style.removeProperty(prop);
    }
    root.setAttribute("data-accent", value);
  }

  function previewCustom(nextHex: string) {
    setSelected(CUSTOM_ACCENT);
    setHex(nextHex);
    const d = deriveAccent(nextHex);
    const root = document.documentElement;
    root.setAttribute("data-accent", CUSTOM_ACCENT);
    root.style.setProperty("--a-light", d.light);
    root.style.setProperty("--a-light-hover", d.lightHover);
    root.style.setProperty("--a-dark", d.dark);
    root.style.setProperty("--a-dark-hover", d.darkHover);
  }

  return (
    <>
      <div className="swatch-row">
        {ACCENTS.map(([value, label]) => (
          <label className="swatch-choice" key={value} data-accent={value} title={label}>
            <input
              type="radio"
              name="accent"
              value={value}
              checked={selected === value}
              onChange={() => previewPreset(value)}
            />
            <span className="dot" aria-hidden>
              {selected === value ? "✓" : ""}
            </span>
            <span className="swatch-name">{label}</span>
          </label>
        ))}

        <label
          className="swatch-choice"
          title="Choose any color"
          style={
            {
              "--a-light": derived.light,
              "--a-dark": derived.dark,
            } as React.CSSProperties
          }
          data-accent={CUSTOM_ACCENT}
        >
          <input
            type="radio"
            name="accent"
            value={CUSTOM_ACCENT}
            checked={selected === CUSTOM_ACCENT}
            onChange={() => previewCustom(hex)}
          />
          <span className="dot" aria-hidden>
            {selected === CUSTOM_ACCENT ? "✓" : ""}
          </span>
          <span className="swatch-name">Custom</span>
        </label>
      </div>

      <div className="custom-color">
        <label htmlFor="accent_custom">Custom Color</label>
        <input
          id="accent_custom"
          name="accent_custom"
          type="color"
          value={hex}
          onChange={(e) => previewCustom(e.target.value)}
        />
        <code>{hex}</code>
      </div>
    </>
  );
}
