import type { LngLat } from "./geo";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function base32(n: number): string {
  if (n === 0) return "0";
  let s = "";
  while (n > 0) {
    s = CROCKFORD[n % 32] + s;
    n = Math.floor(n / 32);
  }
  return s;
}

/**
 * A compact, human-shareable last-known-position code. Packs lat/lng to ~5 m
 * precision into Crockford base32 so it can be read aloud over a crackly phone
 * line or copied into a message. Also emits a standard geo: URI that any map
 * app understands.
 */
export function makeShare(position: LngLat, elevation: number, now: Date) {
  const [lng, lat] = position;
  const latI = Math.round((lat + 90) * 1e5);
  const lngI = Math.round((lng + 180) * 1e5);
  const code = `PD-${base32(latI)}-${base32(lngI)}`;
  const time = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
  const geoUri = `geo:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const text =
    `PagDandi SOS — last known position\n` +
    `${lat.toFixed(5)}, ${lng.toFixed(5)} @ ${Math.round(elevation)} m\n` +
    `Code: ${code} · Time: ${time} IST\n` +
    `Map: ${geoUri}`;
  return { code, geoUri, text, time };
}
