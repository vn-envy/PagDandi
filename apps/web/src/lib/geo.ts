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
