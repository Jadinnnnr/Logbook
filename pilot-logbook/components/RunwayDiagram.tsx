import type { Runway } from "@/lib/airportinfo";

/**
 * Schematic runway layout, drawn from each runway's true heading and length.
 * Runways are drawn through a common centre, so relative orientation and
 * length are to scale but real-world offsets between parallel runways are not
 * — it's an orientation aid, not a substitute for the FAA airport diagram.
 */
export default function RunwayDiagram({ runways }: { runways: Runway[] }) {
  const usable = runways.filter((r) => r.length_ft && r.length_ft > 0);
  if (usable.length === 0) return null;

  const size = 260;
  const c = size / 2;
  const maxLen = Math.max(...usable.map((r) => r.length_ft ?? 0));
  const maxRadius = c - 30;

  /** True heading for the low end, from the data or the runway number itself. */
  const headingOf = (r: Runway): number => {
    if (r.le_heading !== null && !Number.isNaN(r.le_heading)) return r.le_heading;
    const n = parseInt(r.le_ident.replace(/\D/g, ""), 10);
    return Number.isNaN(n) ? 0 : n * 10;
  };

  /**
   * Parallel runways share a heading and would otherwise be drawn on top of one
   * another — KMLB's 9L/27R and 9R/27L would look like a single strip. Group by
   * heading (mod 180, since a runway and its reciprocal are one strip) and slide
   * each member sideways so every runway is visible, ordering L before R.
   */
  const sideBySide = (): { runway: Runway; offset: number }[] => {
    const groups = new Map<number, Runway[]>();
    for (const r of usable) {
      const key = Math.round((((headingOf(r) % 180) + 180) % 180) / 5) * 5;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const out: { runway: Runway; offset: number }[] = [];
    for (const group of groups.values()) {
      const ordered = [...group].sort((a, b) => a.le_ident.localeCompare(b.le_ident));
      const spacing = ordered.length > 2 ? 11 : 14;
      ordered.forEach((runway, i) => {
        out.push({ runway, offset: (i - (ordered.length - 1) / 2) * spacing });
      });
    }
    return out;
  };

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      style={{ width: "100%", maxWidth: 300, height: "auto" }}
      role="img"
      aria-label={`Runway layout: ${usable.map((r) => `${r.le_ident}/${r.he_ident}`).join(", ")}`}
    >
      <circle cx={c} cy={c} r={maxRadius + 16} fill="none" stroke="var(--grid)" strokeWidth={1} />
      <text x={c} y={14} textAnchor="middle" className="axis-label">N</text>

      {sideBySide().map(({ runway: r, offset }) => {
        const heading = headingOf(r);
        // Screen y grows downward, so north (0°) is -y.
        const rad = ((heading - 90) * Math.PI) / 180;
        const half = (maxRadius * (r.length_ft ?? 0)) / maxLen;
        const dx = Math.cos(rad) * half;
        const dy = Math.sin(rad) * half;
        // Slide parallels apart along the perpendicular.
        const ox = Math.cos(rad + Math.PI / 2) * offset;
        const oy = Math.sin(rad + Math.PI / 2) * offset;
        const width = r.length_ft && r.length_ft > 6000 ? 9 : 7;
        const x1 = c + ox - dx;
        const y1 = c + oy - dy;
        const x2 = c + ox + dx;
        const y2 = c + oy + dy;
        return (
          <g key={`${r.le_ident}-${r.he_ident}`}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--text-secondary)"
              strokeWidth={width}
              strokeLinecap="butt"
            />
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--surface)"
              strokeWidth={1}
              strokeDasharray="6 8"
            />
            <text
              x={c + ox - dx * 1.16}
              y={c + oy - dy * 1.16 + 4}
              textAnchor="middle"
              className="axis-label"
              style={{ fontSize: 10 }}
            >
              {r.le_ident}
            </text>
            <text
              x={c + ox + dx * 1.16}
              y={c + oy + dy * 1.16 + 4}
              textAnchor="middle"
              className="axis-label"
              style={{ fontSize: 10 }}
            >
              {r.he_ident}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
