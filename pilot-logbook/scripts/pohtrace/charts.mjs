// Per-chart pixel calibration, read off the detected gridlines (SCALE = 6).
// x is the distance axis, y carries OAT / weight / wind depending on the panel.
export const CHARTS = {
  158: { name: "takeoff-50ft", title: "Takeoff Distance Over a 50 ft Barrier", flaps: "up", paLevels: [0,2000,4000,6000,8000],
    dist: { x: 1048, v: 5000, per: -500 / 218.5 },
    oat:  { y: 2529, v: 50, per: -10 / 184.14, region: { x0: 1040, y0: 2500, x1: 2850, y1: 3860 } },
    wt:   { min: 2100, y: 1743, v: 2100, per: 100 / 157.25, ref: 2450, refV: 2550, region: { x0: 1040, y0: 1700, x1: 2850, y1: 2455 } },
    wind: { y: 1591, v: 0, per: -5 / 226.0, ref: 1591, region: { x0: 1040, y0: 905, x1: 2850, y1: 1596 } },
    example: { pa: 2000, oat: 23, weight: 2400, wind: 8, expect: 1907 } },

  160: { name: "takeoff-roll", title: "Takeoff Ground Roll", flaps: "up", paLevels: [0,2000,4000,6000,8000],
    dist: { x: 1073, v: 2800, per: -200 / 146.083 },
    oat:  { y: 2525, v: 50, per: -10 / 183.71, region: { x0: 1060, y0: 2500, x1: 2850, y1: 3860 } },
    wt:   { min: 2100, y: 1738, v: 2100, per: 100 / 157.0, ref: 2445, refV: 2550, region: { x0: 1060, y0: 1700, x1: 2850, y1: 2450 } },
    wind: { y: 1585, v: 0, per: -5 / 225.33, ref: 1585, region: { x0: 1060, y0: 905, x1: 2850, y1: 1590 } },
    example: { pa: 2000, oat: 23, weight: 2400, wind: 8, expect: 1073 } },

  176: { name: "landing-50ft", title: "Landing Distance Over a 50 ft Barrier", flaps: "40", paLevels: [0,2000,4000,6000,7000],
    dist: { x: 1039, v: 1800, per: -100 / 292.83 },
    oat:  { y: 2531, v: 50, per: -10 / 184.0, region: { x0: 1030, y0: 2500, x1: 2850, y1: 3860 } },
    wt:   { min: 2000, y: 1687, v: 2000, per: 100 / 135.6, ref: 2432, refV: 2550, region: { x0: 1030, y0: 1650, x1: 2850, y1: 2437 } },
    wind: { y: 1591, v: 0, per: -5 / 224.67, ref: 1591, region: { x0: 1030, y0: 910, x1: 2850, y1: 1596 } },
    example: { pa: 2500, oat: 21, weight: 2240, wind: 5, expect: 1290 } },

  177: { name: "landing-roll", title: "Landing Ground Roll", flaps: "40", paLevels: [0,1000,2000,3000,4000,5000,6000,7000],
    dist: { x: 1201, v: 1300, per: -100 / 243.57 },
    oat:  { y: 2475, v: 50, per: -10 / 178.57, region: { x0: 1190, y0: 2450, x1: 2920, y1: 3730 } },
    wt:   { min: 2000, y: 1698, v: 2000, per: 100 / 130.2, ref: 2414, refV: 2550, region: { x0: 1190, y0: 1660, x1: 2920, y1: 2419 } },
    wind: { y: 1571, v: 0, per: -5 / 218.33, ref: 1571, region: { x0: 1190, y0: 900, x1: 2920, y1: 1576 } },
    example: { pa: 2500, oat: 21, weight: 2240, wind: 5, expect: 820 } },
};

export const axis = (a) => ({
  toPx: (v) => a.y !== undefined ? a.y + (v - a.v) / a.per : a.x + (v - a.v) / a.per,
  toVal: (p) => a.v + (p - (a.y !== undefined ? a.y : a.x)) * a.per,
});
