import type { LngLat } from "./geo";

/**
 * A Trek Pack is the atomic unit of PagDandi: one downloadable file containing
 * the map (PMTiles), the trail, and the "intelligence" (POIs, elevation, exits,
 * emergency info) for a single trek. Once on the phone, everything below works
 * in airplane mode.
 */

export type PoiCategory =
  | "viewpoint"
  | "campsite"
  | "water"
  | "shelter"
  | "exit"
  | "summit"
  | "food";

export interface Poi {
  id: string;
  name: string;
  category: PoiCategory;
  coord: LngLat;
  ele?: number;
  note?: string;
}

export interface EmergencyContact {
  label: string;
  number: string;
}

export interface TrekPackManifest {
  id: string;
  name: string;
  nativeName?: string;
  region: string;
  difficulty: "easy" | "moderate" | "hard";
  /** Bounding box [west, south, east, north] used for the PMTiles extract. */
  bbox: [number, number, number, number];
  center: LngLat;
  /** Relative URL of the offline PMTiles vector bundle, if present. */
  pmtiles?: string;
  /** Ordered trail geometry (start -> end). */
  trail: LngLat[];
  /** Elevation (m) parallel to `trail`. */
  elevation: number[];
  pois: Poi[];
  emergency: EmergencyContact[];
  /** Sunset reference date for the demo (ISO). Real GPS uses `new Date()`. */
  demoDate?: string;
  attribution: string;
  bytes?: number;
}

export const POI_META: Record<
  PoiCategory,
  { label: string; color: string; emoji: string }
> = {
  viewpoint: { label: "Viewpoint", color: "#8b5cf6", emoji: "\u{1F304}" },
  campsite: { label: "Campsite", color: "#0ea5e9", emoji: "\u{26FA}" },
  water: { label: "Water source", color: "#06b6d4", emoji: "\u{1F4A7}" },
  shelter: { label: "Shelter", color: "#f59e0b", emoji: "\u{1F3E0}" },
  exit: { label: "Exit / SOS", color: "#ef4444", emoji: "\u{1F6A8}" },
  summit: { label: "Summit", color: "#e11d48", emoji: "\u{1F3D4}" },
  food: { label: "Food / chai", color: "#22c55e", emoji: "\u{2615}" },
};

export async function loadTrekPack(url: string): Promise<TrekPackManifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load Trek Pack: ${res.status}`);
  return (await res.json()) as TrekPackManifest;
}
