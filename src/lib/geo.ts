/**
 * Pure geospatial helpers. No dependencies, no network — these run on-device
 * and form the "world model" that Trail Sathi (Gemma) reasons over via tools.
 */

export type LngLat = [number, number]; // [lng, lat]

const R = 6371000; // Earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in metres between two [lng, lat] points. */
export function haversine(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Initial bearing in degrees (0–360, 0 = north) from a → b. */
export function bearing(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

/** Human-readable compass point for a bearing, e.g. 47° -> "NE". */
export function compass(deg: number): string {
  return COMPASS[Math.round(deg / 22.5) % 16];
}

/** Format a distance in metres for display. */
export function fmtDistance(m: number): string {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`;
}

/** Format seconds as a compact human duration, e.g. "1 h 25 min". */
export function fmtDuration(seconds: number): string {
  const mins = Math.max(0, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export interface TrailPoint {
  coord: LngLat;
  ele: number; // metres
  dist: number; // cumulative distance from start (m)
}

/**
 * Build a densified trail with cumulative distances from a coordinate list and
 * a parallel elevation array. This is the elevation profile Trail Sathi uses.
 */
export function buildTrail(coords: LngLat[], elevations: number[]): TrailPoint[] {
  const pts: TrailPoint[] = [];
  let cum = 0;
  for (let i = 0; i < coords.length; i++) {
    if (i > 0) cum += haversine(coords[i - 1], coords[i]);
    pts.push({ coord: coords[i], ele: elevations[i] ?? 0, dist: cum });
  }
  return pts;
}

export function trailLength(trail: TrailPoint[]): number {
  return trail.length ? trail[trail.length - 1].dist : 0;
}

/** Interpolate a position + elevation at a fractional progress (0–1). */
export function pointAtFraction(trail: TrailPoint[], frac: number) {
  const total = trailLength(trail);
  const target = Math.max(0, Math.min(1, frac)) * total;
  return pointAtDistance(trail, target);
}

export function pointAtDistance(trail: TrailPoint[], target: number) {
  if (trail.length === 0) return { coord: [0, 0] as LngLat, ele: 0, dist: 0, index: 0 };
  if (target <= 0) return { ...trail[0], index: 0 };
  const total = trailLength(trail);
  if (target >= total)
    return { ...trail[trail.length - 1], index: trail.length - 1 };

  for (let i = 1; i < trail.length; i++) {
    if (trail[i].dist >= target) {
      const a = trail[i - 1];
      const b = trail[i];
      const seg = b.dist - a.dist || 1;
      const t = (target - a.dist) / seg;
      const coord: LngLat = [
        a.coord[0] + (b.coord[0] - a.coord[0]) * t,
        a.coord[1] + (b.coord[1] - a.coord[1]) * t,
      ];
      const ele = a.ele + (b.ele - a.ele) * t;
      return { coord, ele, dist: target, index: i - 1 };
    }
  }
  return { ...trail[trail.length - 1], index: trail.length - 1 };
}

/** Snap an arbitrary point to the nearest position along the trail. */
export function snapToTrail(trail: TrailPoint[], p: LngLat) {
  let best = { dist: 0, gap: Infinity, index: 0 };
  for (let i = 0; i < trail.length; i++) {
    const g = haversine(trail[i].coord, p);
    if (g < best.gap) best = { dist: trail[i].dist, gap: g, index: i };
  }
  return best;
}

/**
 * Total remaining ascent (sum of positive elevation gains) from a distance
 * along the trail to the end. This is what "can I make the summit?" hinges on.
 */
export function remainingAscent(trail: TrailPoint[], fromDist: number): number {
  let gain = 0;
  let started = false;
  for (let i = 1; i < trail.length; i++) {
    if (trail[i].dist < fromDist) continue;
    if (!started) {
      started = true;
      const here = pointAtDistance(trail, fromDist).ele;
      const delta = trail[i].ele - here;
      if (delta > 0) gain += delta;
      continue;
    }
    const delta = trail[i].ele - trail[i - 1].ele;
    if (delta > 0) gain += delta;
  }
  return gain;
}

/**
 * Naismith's rule with a fatigue tweak: base walking speed + extra time per
 * metre of ascent. Returns estimated seconds. paceKmh is flat-ground pace.
 */
export function estimateTime(
  distanceM: number,
  ascentM: number,
  paceKmh = 3.2
): number {
  const flat = (distanceM / 1000 / paceKmh) * 3600;
  const climb = (ascentM / 600) * 3600; // ~600 m ascent per extra hour
  return flat + climb;
}
