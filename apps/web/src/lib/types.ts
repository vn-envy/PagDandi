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
  description: string;
  bbox: [number, number, number, number];
  center: [number, number];
  defaultZoom: number;
  pmtiles: string;
  trailLengthKm: number;
  maxElevationM: number;
  start: { id: string; name: string; lat: number; lng: number; elevationM: number };
  summit: { id: string; name: string; lat: number; lng: number; elevationM: number };
  emergency: Record<string, string>;
  waypoints: Waypoint[];
  demoPositions: Array<{ label: string; kmAlongTrail: number; scenario: string }>;
}

export interface Position {
  lat: number;
  lng: number;
  elevationM: number;
  kmAlongTrail: number;
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

export interface PeerState {
  id: string;
  name: string;
  lat: number;
  lng: number;
  timestamp: number;
  status: "ok" | "sos";
  visible: boolean;
}

// Monochrome ramp — type is distinguished by icon + shade; red is SOS-only.
export const POI_COLORS: Record<PoiType, string> = {
  viewpoint: "#8a8a8a",
  campsite: "#737373",
  water: "#525252",
  shelter: "#404040",
  exit: "#171717",
  sos: "#dc2626",
};

export const POI_LABELS: Record<PoiType, string> = {
  viewpoint: "Viewpoint",
  campsite: "Campsite",
  water: "Water",
  shelter: "Shelter",
  exit: "Exit",
  sos: "SOS",
};

// Same-origin /api/* is proxied to the backend via next.config.ts rewrites
export const SERVER_URL = "";

export const WS_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3847/humsafar`
    : "ws://localhost:3847/humsafar";
