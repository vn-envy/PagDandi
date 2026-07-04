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

export const POI_COLORS: Record<PoiType, string> = {
  viewpoint: "#f59e0b",
  campsite: "#22c55e",
  water: "#3b82f6",
  shelter: "#a855f7",
  exit: "#64748b",
  sos: "#ef4444",
};

export const POI_LABELS: Record<PoiType, string> = {
  viewpoint: "Viewpoint",
  campsite: "Campsite",
  water: "Water",
  shelter: "Shelter",
  exit: "Exit",
  sos: "SOS",
};

export const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3847";
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3847/humsafar";
