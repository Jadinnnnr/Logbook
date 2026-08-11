"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
  ident: string;
  lat: number;
  lon: number;
  name: string;
  kind: "airport" | "fix" | "navaid";
}

export default function RouteMap({ points }: { points: MapPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;
      const map = L.map(ref.current, { scrollWheelZoom: false });
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const latlngs = points.map((p) => [p.lat, p.lon] as [number, number]);
      if (latlngs.length > 1) {
        L.polyline(latlngs, { color: "#2a78d6", weight: 3, opacity: 0.9 }).addTo(map);
      }
      for (const p of points) {
        const isAirport = p.kind === "airport";
        L.circleMarker([p.lat, p.lon], {
          radius: isAirport ? 7 : 4,
          color: "#ffffff",
          weight: isAirport ? 2 : 1.5,
          fillColor: isAirport ? "#2a78d6" : "#52514e",
          fillOpacity: 1,
        })
          .bindTooltip(
            isAirport ? `${p.ident} — ${p.name}` : `${p.ident} (${p.kind === "fix" ? "fix" : "navaid"})`
          )
          .addTo(map);
      }
      if (latlngs.length > 1) {
        map.fitBounds(L.latLngBounds(latlngs).pad(0.3));
      } else {
        map.setView(latlngs[0], 10);
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [points]);

  return (
    <div
      ref={ref}
      style={{ height: 420, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}
    />
  );
}
