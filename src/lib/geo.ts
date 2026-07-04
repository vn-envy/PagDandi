/** Geodesy helpers. All distances in meters, bearings in degrees from north. */

export type LngLat = { lng: number; lat: number };

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearing(from: LngLat, to: LngLat): number {
  const y = Math.sin(rad(to.lng - from.lng)) * Math.cos(rad(to.lat));
  const x =
    Math.cos(rad(from.lat)) * Math.sin(rad(to.lat)) -
    Math.sin(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.cos(rad(to.lng - from.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function compass(b: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(b / 22.5) % 16];
}

export function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`;
}

export function fmtDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/**
 * Open Location Code ("plus code") encoder — the shareable last-known-position
 * code on the SOS card. Real standard, decodable by any OLC implementation.
 */
const OLC_ALPHABET = "23456789CFGHJMPQRVWX";
export function encodePlusCode(lat: number, lng: number, codeLength = 11): string {
  let latVal = Math.min(Math.max(lat + 90, 0), 180);
  let lngVal = ((((lng + 180) % 360) + 360) % 360);
  // work in integer units of the finest resolution
  latVal = Math.floor(latVal * 8000 * 5 ** 5);
  lngVal = Math.floor(lngVal * 8000 * 4 ** 5);

  let code = "";
  // grid refinement (chars 11+)
  const gridChars = Math.max(codeLength - 10, 0);
  let gridCode = "";
  for (let i = 0; i < 5; i++) {
    const latDigit = latVal % 5;
    const lngDigit = lngVal % 4;
    gridCode = OLC_ALPHABET[latDigit * 4 + lngDigit] + gridCode;
    latVal = Math.floor(latVal / 5);
    lngVal = Math.floor(lngVal / 4);
  }
  // pair section (first 10 chars)
  for (let i = 0; i < 5; i++) {
    code = OLC_ALPHABET[lngVal % 20] + code;
    code = OLC_ALPHABET[latVal % 20] + code;
    latVal = Math.floor(latVal / 20);
    lngVal = Math.floor(lngVal / 20);
  }
  code = code.slice(0, 8) + "+" + code.slice(8);
  if (gridChars > 0) code += gridCode.slice(0, gridChars);
  return code;
}
