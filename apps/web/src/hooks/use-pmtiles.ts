import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";

type MapTheme = "light" | "dark";

// Register before any Map instance is created (useEffect is too late).
if (typeof window !== "undefined") {
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
}

/** PMTiles requires an absolute HTTP(S) URL: pmtiles://https://host/path/file.pmtiles */
export function resolvePmtilesUrl(path: string): string {
  if (path.startsWith("pmtiles://")) return path;
  const absolute = path.startsWith("http")
    ? path
    : typeof window !== "undefined"
      ? `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`
      : `http://localhost:3000${path.startsWith("/") ? path : `/${path}`}`;
  return `pmtiles://${absolute}`;
}

export function buildOfflineStyle(
  pmtilesPath: string,
  theme: MapTheme = "dark",
): maplibregl.StyleSpecification {
  // Monochrome basemap: "white"/"black" flavors keep the ground quiet so the
  // trail line, position dot, and POIs are the only figure.
  const flavor = theme === "dark" ? namedFlavor("black") : namedFlavor("white");
  const sprite =
    theme === "dark"
      ? "https://protomaps.github.io/basemaps-assets/sprites/v4/black"
      : "https://protomaps.github.io/basemaps-assets/sprites/v4/white";

  return {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite,
    sources: {
      protomaps: {
        type: "vector",
        url: resolvePmtilesUrl(pmtilesPath),
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers("protomaps", flavor, { lang: "en" }),
  };
}

/** @deprecated protocol now registers at module load */
export function usePmtilesProtocol() {
  /* no-op */
}
