import type { PoiFeature, TrekManifest } from "@/lib/types";

import manifestJson from "./manifest.json";
import trailJson from "./trail";
import poisJson from "./pois";

export const triundManifest = manifestJson as unknown as TrekManifest;

export const triundTrailCoords = (
  trailJson as unknown as { features: Array<{ geometry: { coordinates: [number, number][] } }> }
).features[0].geometry.coordinates;

export const triundPois: PoiFeature[] = (
  poisJson as unknown as {
    features: Array<{
      properties: {
        id: string;
        name: string;
        type: PoiFeature["type"];
        elevationM: number;
        description?: string;
      };
      geometry: { coordinates: [number, number] };
    }>;
  }
).features.map((f) => ({
  id: f.properties.id,
  name: f.properties.name,
  type: f.properties.type,
  elevationM: f.properties.elevationM,
  description: f.properties.description,
  lng: f.geometry.coordinates[0],
  lat: f.geometry.coordinates[1],
}));
