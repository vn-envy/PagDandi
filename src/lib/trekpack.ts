import { haversine, type LngLat } from "./geo";

/** One downloadable Trek Pack = map.pmtiles + this manifest. */

export type PoiCategory =
  | "viewpoint"
  | "campsite"
  | "water"
  | "shelter"
  | "cafe"
  | "temple"
  | "peak"
  | "waypoint";

export interface Poi {
  id: string;
  name: string | null;
  category: PoiCategory;
  lat: number;
  lon: number;
  ele: number | null;
  offTrail?: number;
}

export interface ExitPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  ele: number;
  note: string;
}

export interface TrekPack {
  format: string;
  builtAt: string;
  trek: {
    id: string;
    name: string;
    region: string;
    country: string;
    timezone: string;
    difficulty: string;
    bbox: [number, number, number, number];
    map: { pmtiles: string; attribution: string };
    languages: string[];
    emergency: { label: string; number: string }[];
    notes: string[];
  };
  /** [lng, lat, ele_m, cumulative_distance_m] per vertex, trailhead -> summit */
  trail: [number, number, number, number][];
  stats: { lengthM: number; minEle: number; maxEle: number; ascentM: number };
  pois: Poi[];
  exits: ExitPoint[];
}

export async function loadPack(id: string): Promise<TrekPack> {
  const res = await fetch(`${import.meta.env.BASE_URL}packs/${id}/pack.json`);
  if (!res.ok) throw new Error(`Trek Pack "${id}" failed to load (${res.status})`);
  return res.json();
}

/** A point on the trail resolved from a distance-from-trailhead value. */
export interface TrailPosition {
  lng: number;
  lat: number;
  ele: number;
  /** meters walked from the trailhead */
  distM: number;
}

export function positionAt(pack: TrekPack, distM: number): TrailPosition {
  const trail = pack.trail;
  const target = Math.max(0, Math.min(distM, pack.stats.lengthM));
  // binary search on cumulative distance
  let lo = 0;
  let hi = trail.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (trail[mid][3] < target) lo = mid + 1;
    else hi = mid;
  }
  const j = Math.max(1, lo);
  const a = trail[j - 1];
  const b = trail[j];
  const span = b[3] - a[3] || 1;
  const t = (target - a[3]) / span;
  return {
    lng: a[0] + (b[0] - a[0]) * t,
    lat: a[1] + (b[1] - a[1]) * t,
    ele: a[2] + (b[2] - a[2]) * t,
    distM: target,
  };
}

/** Snap an arbitrary point to the nearest trail vertex. */
export function nearestOnTrail(pack: TrekPack, p: LngLat): TrailPosition {
  let best = 0;
  let bestD = Infinity;
  pack.trail.forEach((v, i) => {
    const d = haversine(p, { lng: v[0], lat: v[1] });
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  const v = pack.trail[best];
  return { lng: v[0], lat: v[1], ele: v[2], distM: v[3] };
}

/** Total remaining ascent (uphill only) from a trail distance to the end. */
export function remainingAscent(pack: TrekPack, fromDistM: number): number {
  const trail = pack.trail;
  let ascent = 0;
  let prevEle: number | null = null;
  for (const v of trail) {
    if (v[3] < fromDistM) continue;
    if (prevEle === null) {
      prevEle = positionAt(pack, fromDistM).ele;
    }
    if (v[2] > prevEle) ascent += v[2] - prevEle;
    prevEle = v[2];
  }
  return Math.round(ascent);
}

/**
 * Naismith's rule with Langmuir descent correction — the standard walker's
 * time estimate: 12 min/km + 10 min per 100 m of ascent + 5 min per 300 m of
 * steep descent.
 */
export function estimateMinutes(distanceM: number, ascentM: number, descentM = 0): number {
  return (distanceM / 1000) * 12 + (ascentM / 100) * 10 + (descentM / 300) * 5;
}

/** Ascent and descent between two points along the trail. */
export function elevationBetween(
  pack: TrekPack,
  fromDistM: number,
  toDistM: number,
): { ascent: number; descent: number } {
  const [a, b] = fromDistM <= toDistM ? [fromDistM, toDistM] : [toDistM, fromDistM];
  let ascent = 0;
  let descent = 0;
  let prev = positionAt(pack, a).ele;
  for (const v of pack.trail) {
    if (v[3] <= a || v[3] > b) continue;
    if (v[2] > prev) ascent += v[2] - prev;
    else descent += prev - v[2];
    prev = v[2];
  }
  if (fromDistM > toDistM) return { ascent: Math.round(descent), descent: Math.round(ascent) };
  return { ascent: Math.round(ascent), descent: Math.round(descent) };
}
