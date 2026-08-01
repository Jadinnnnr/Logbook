"use client";

import { useState } from "react";

interface Tooltip {
  leftPct: number;
  topPct: number;
  text: string;
}

/** Column chart of hours per time bucket. Single series — no legend; per-bar hover tooltip. */
export function HoursOverTimeChart({ data }: { data: { label: string; value: number }[] }) {
  const [tip, setTip] = useState<Tooltip | null>(null);
  const W = 720;
  const H = 240;
  const pad = { top: 12, right: 8, bottom: 26, left: 34 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  // Round the axis max up to a friendly step.
  const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : 25;
  const axisMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= axisMax; v += step) ticks.push(v);
  const slot = plotW / data.length;
  const barW = Math.min(40, Math.max(2, slot * 0.62));
  // Roughly one label per 34px of width, so dense ranges stay readable.
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.floor(plotW / 34)));

  return (
    <div className="chart-svg-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Hours flown over time">
        {ticks.map((v) => {
          const y = pad.top + plotH - (v / axisMax) * plotH;
          return (
            <g key={v}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke={v === 0 ? "var(--baseline)" : "var(--grid)"} strokeWidth={1} />
              <text x={pad.left - 6} y={y + 3.5} textAnchor="end" className="axis-label">{v}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / axisMax) * plotH;
          const x = pad.left + i * slot + (slot - barW) / 2;
          const y = pad.top + plotH - h;
          const r = Math.min(4, h);
          const cx = x + barW / 2;
          return (
            <g key={d.label}>
              {d.value > 0 && (
                <path
                  d={`M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z`}
                  fill="var(--series-1)"
                />
              )}
              {/* Oversized invisible hit target for hover */}
              <rect
                x={pad.left + i * slot}
                y={pad.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() =>
                  setTip({ leftPct: (cx / W) * 100, topPct: (y / H) * 100, text: `${d.label}: ${d.value.toFixed(1)} hrs` })
                }
                onMouseLeave={() => setTip(null)}
              />
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" className="axis-label">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="chart-tooltip" style={{ left: `${tip.leftPct}%`, top: `${tip.topPct}%` }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for hours by category (aircraft type). One hue; direct value labels. */
export function HoursByTypeChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map((d) => (
        <div key={d.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 56px", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>
            {d.label}
          </span>
          <div style={{ height: 16, position: "relative" }}>
            <div
              style={{
                width: `${Math.max((d.value / max) * 100, 0.5)}%`,
                height: "100%",
                background: "var(--series-1)",
                borderRadius: "0 4px 4px 0",
              }}
              title={`${d.label}: ${d.value.toFixed(1)} hrs`}
            />
          </div>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {d.value.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

const SERIES_VARS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

/** One horizontal stacked bar for a part-to-whole breakdown, with legend + direct labels. */
export function BreakdownBar({ segments }: { segments: { label: string; value: number }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  if (total <= 0) return <p className="muted">No hours logged yet.</p>;
  return (
    <div>
      <div style={{ display: "flex", gap: 2, height: 26, borderRadius: 5, overflow: "hidden" }}>
        {shown.map((s) => {
          const i = segments.indexOf(s);
          return (
            <div
              key={s.label}
              style={{ width: `${(s.value / total) * 100}%`, background: SERIES_VARS[i % SERIES_VARS.length], minWidth: 2 }}
              title={`${s.label}: ${s.value.toFixed(1)} hrs (${((s.value / total) * 100).toFixed(0)}%)`}
            />
          );
        })}
      </div>
      <div className="legend">
        {segments.map((s, i) => (
          <span key={s.label}>
            <span className="swatch" style={{ background: SERIES_VARS[i % SERIES_VARS.length] }} />
            {s.label}: {s.value.toFixed(1)} hrs
            {total > 0 && ` (${((s.value / total) * 100).toFixed(0)}%)`}
          </span>
        ))}
      </div>
    </div>
  );
}
