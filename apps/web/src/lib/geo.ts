import type { Position, TrekManifest } from "./types";

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function interpolatePosition(
  manifest: TrekManifest,
  kmAlongTrail: number,
): Position {
  const wps = manifest.waypoints;
  const clamped = Math.max(0, Math.min(manifest.trailLengthKm, kmAlongTrail));

  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i];
    const b = wps[i + 1];
    if (clamped >= a.kmAlongTrail && clamped <= b.kmAlongTrail) {
      const t = (clamped - a.kmAlongTrail) / (b.kmAlongTrail - a.kmAlongTrail || 1);
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        elevationM: Math.round(a.elevationM + (b.elevationM - a.elevationM) * t),
        kmAlongTrail: clamped,
      };
    }
  }

  const last = wps[wps.length - 1];
  return {
    lat: last.lat,
    lng: last.lng,
    elevationM: last.elevationM,
    kmAlongTrail: clamped,
  };
}

export function isPeerStale(timestamp: number, staleMs = 40 * 60 * 1000): boolean {
  return Date.now() - timestamp > staleMs;
}

/**
 * Project a real GPS fix onto the trail polyline: returns the km mark of the
 * nearest point on any waypoint segment plus how far off-trail the fix is.
 * Planar approximation with latitude scaling — fine at trail scale.
 */
export function snapToTrail(
  manifest: TrekManifest,
  lat: number,
  lng: number,
): { kmAlongTrail: number; offTrailKm: number } {
  const wps = manifest.waypoints;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const toXY = (la: number, ln: number): [number, number] => [
    ln * 111.32 * cosLat,
    la * 110.574,
  ];
  const p = toXY(lat, lng);
  let best = { kmAlongTrail: 0, offTrailKm: Number.POSITIVE_INFINITY };
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i];
    const b = wps[i + 1];
    const A = toXY(a.lat, a.lng);
    const B = toXY(b.lat, b.lng);
    const abx = B[0] - A[0];
    const aby = B[1] - A[1];
    const len2 = abx * abx + aby * aby || 1e-9;
    let t = ((p[0] - A[0]) * abx + (p[1] - A[1]) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p[0] - (A[0] + t * abx), p[1] - (A[1] + t * aby));
    if (d < best.offTrailKm) {
      best = {
        offTrailKm: d,
        kmAlongTrail: a.kmAlongTrail + t * (b.kmAlongTrail - a.kmAlongTrail),
      };
    }
  }
  return {
    kmAlongTrail: Number(best.kmAlongTrail.toFixed(2)),
    offTrailKm: Number(best.offTrailKm.toFixed(2)),
  };
}
