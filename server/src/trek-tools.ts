import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type PoiType = "viewpoint" | "campsite" | "water" | "shelter" | "exit" | "sos";

export interface Waypoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  elevationM: number;
  distanceKm: number;
  kmAlongTrail: number;
}

export interface TrekManifest {
  id: string;
  name: string;
  nameHi: string;
  region: string;
  waypoints: Waypoint[];
  summit: { name: string; lat: number; lng: number; elevationM: number };
  start: { name: string; lat: number; lng: number; elevationM: number };
  emergency: Record<string, string>;
  trailLengthKm: number;
}

export interface Position {
  lat: number;
  lng: number;
  elevationM: number;
  kmAlongTrail: number;
  timestamp?: string;
}

export interface PoiFeature {
  id: string;
  name: string;
  type: PoiType;
  lat: number;
  lng: number;
  elevationM: number;
  description?: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const TREK_ROOT = join(__dirname, "../../trek-packs/triund");

let manifestCache: TrekManifest | null = null;
let poisCache: PoiFeature[] | null = null;

export function loadManifest(): TrekManifest {
  if (!manifestCache) {
    manifestCache = JSON.parse(
      readFileSync(join(TREK_ROOT, "manifest.json"), "utf-8"),
    ) as TrekManifest;
  }
  return manifestCache;
}

export function loadPois(): PoiFeature[] {
  if (!poisCache) {
    const geojson = JSON.parse(readFileSync(join(TREK_ROOT, "pois.geojson"), "utf-8"));
    poisCache = geojson.features.map(
      (f: {
        properties: {
          id: string;
          name: string;
          type: PoiType;
          elevationM: number;
          description?: string;
        };
        geometry: { coordinates: [number, number] };
      }) => ({
        id: f.properties.id,
        name: f.properties.name,
        type: f.properties.type,
        elevationM: f.properties.elevationM,
        description: f.properties.description,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      }),
    );
  }
  return poisCache!;
}

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

export function bearingDegrees(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function bearingLabel(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

export function interpolatePosition(kmAlongTrail: number): Position {
  const manifest = loadManifest();
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

export function distanceToPoi(
  position: Position,
  poiId: string,
): { poi: PoiFeature; distanceKm: number; bearing: number; bearingLabel: string } {
  const pois = loadPois();
  const poi = pois.find((p) => p.id === poiId);
  if (!poi) throw new Error(`POI not found: ${poiId}`);
  const distanceKm = haversineKm(position.lat, position.lng, poi.lat, poi.lng);
  const bearing = bearingDegrees(position.lat, position.lng, poi.lat, poi.lng);
  return { poi, distanceKm, bearing, bearingLabel: bearingLabel(bearing) };
}

export function nearestPoi(
  position: Position,
  type: PoiType,
): { poi: PoiFeature; distanceKm: number; bearing: number; bearingLabel: string } {
  const pois = loadPois().filter((p) => p.type === type);
  if (!pois.length) throw new Error(`No POIs of type: ${type}`);
  let best = pois[0];
  let bestDist = haversineKm(position.lat, position.lng, best.lat, best.lng);
  for (const poi of pois.slice(1)) {
    const d = haversineKm(position.lat, position.lng, poi.lat, poi.lng);
    if (d < bestDist) {
      best = poi;
      bestDist = d;
    }
  }
  const bearing = bearingDegrees(position.lat, position.lng, best.lat, best.lng);
  return {
    poi: best,
    distanceKm: bestDist,
    bearing,
    bearingLabel: bearingLabel(bearing),
  };
}

export function remainingAscent(position: Position): {
  remainingM: number;
  summitElevationM: number;
  summitName: string;
  distanceToSummitKm: number;
} {
  const manifest = loadManifest();
  const summit = manifest.summit;
  const remainingM = Math.max(0, summit.elevationM - position.elevationM);
  const distanceToSummitKm = haversineKm(
    position.lat,
    position.lng,
    summit.lat,
    summit.lng,
  );
  return {
    remainingM,
    summitElevationM: summit.elevationM,
    summitName: summit.name,
    distanceToSummitKm,
  };
}

export function sunsetTime(lat: number, lng: number, date = new Date()): {
  sunsetLocal: string;
  minutesUntilSunset: number;
  civilTwilightEnd: string;
} {
  // Simplified solar calculation for demo (adequate for mountain safety estimates)
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const declination = 23.45 * Math.sin(((360 / 365) * (dayOfYear - 81) * Math.PI) / 180);
  const latRad = (lat * Math.PI) / 180;
  const declRad = (declination * Math.PI) / 180;
  const hourAngle = Math.acos(-Math.tan(latRad) * Math.tan(declRad));
  const solarNoonUtc = 12 - lng / 15;
  const sunsetUtc = solarNoonUtc + (hourAngle * 180) / Math.PI / 15;
  const istOffset = 5.5;
  const sunsetHours = sunsetUtc + istOffset;
  const h = Math.floor(sunsetHours);
  const m = Math.round((sunsetHours - h) * 60);
  const sunsetLocal = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} IST`;

  const nowHours = date.getUTCHours() + date.getUTCMinutes() / 60 + istOffset;
  const minutesUntilSunset = Math.round((sunsetHours - nowHours) * 60);

  const twilightHours = sunsetHours + 0.5;
  const th = Math.floor(twilightHours);
  const tm = Math.round((twilightHours - th) * 60);
  const civilTwilightEnd = `${String(th).padStart(2, "0")}:${String(tm).padStart(2, "0")} IST`;

  return { sunsetLocal, minutesUntilSunset, civilTwilightEnd };
}

export function estimateHikingMinutes(distanceKm: number, ascentM: number): number {
  // Naismith's rule variant: 5 km/h + 10 min per 100m ascent
  return Math.round((distanceKm / 5) * 60 + (ascentM / 100) * 10);
}

export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "distance_to",
      description: "Get distance and bearing from current position to a specific POI by id",
      parameters: {
        type: "object",
        properties: {
          poi_id: { type: "string", description: "POI id e.g. poi-water-1" },
        },
        required: ["poi_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "nearest",
      description: "Find nearest POI of a given type from current position",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["viewpoint", "campsite", "water", "shelter", "exit", "sos"],
          },
        },
        required: ["type"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remaining_ascent",
      description: "Calculate remaining elevation gain to summit from current position",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "sunset_time",
      description: "Get sunset time and minutes until sunset at current location",
      parameters: { type: "object", properties: {} },
    },
  },
];

export function executeTool(
  name: string,
  args: Record<string, unknown>,
  position: Position,
): unknown {
  switch (name) {
    case "distance_to":
      return distanceToPoi(position, String(args.poi_id));
    case "nearest":
      return nearestPoi(position, args.type as PoiType);
    case "remaining_ascent":
      return remainingAscent(position);
    case "sunset_time":
      return sunsetTime(position.lat, position.lng);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function buildSystemPrompt(position: Position): string {
  const manifest = loadManifest();
  const pois = loadPois();
  const poiSummary = pois
    .map((p) => `- ${p.id}: ${p.name} (${p.type}, ${p.elevationM}m)`)
    .join("\n");

  return `You are Trail Sathi, an on-device trekking guide for ${manifest.name} (${manifest.nameHi}) in ${manifest.region}.
You are NOT a general chatbot. Use the provided tools to reason about the trekker's live situation.

CURRENT POSITION:
- lat/lng: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}
- elevation: ${position.elevationM}m
- km along trail: ${position.kmAlongTrail.toFixed(1)} / ${manifest.trailLengthKm} km

TRAIL FACTS:
- Start: ${manifest.start.name} (${manifest.start.elevationM}m)
- Summit: ${manifest.summit.name} (${manifest.summit.elevationM}m)
- Total length: ${manifest.trailLengthKm} km

POIs:
${poiSummary}

RULES:
- Call tools BEFORE making any distance, time, or elevation claim. Never guess numbers.
- For summit-timing questions, call BOTH remaining_ascent AND sunset_time, then estimate hiking time with Naismith's rule: (distance_km / 5) * 60 + (ascent_m / 100) * 10 minutes.
- Answer decisively in 2-4 sentences. The trekker is on a mountain — do not ask follow-up questions; make the safe call with the data you have.
- Recommend camping or turning back whenever the daylight margin after Naismith time is under 45 minutes.`;
}
