import type { StyleSpecification } from "maplibre-gl";

/**
 * Build a MapLibre style for the offline map.
 *
 * When an offline PMTiles vector bundle is present we style the Protomaps
 * basemap schema (earth / water / landuse / roads). When it is absent (e.g. the
 * ~40 MB tile file hasn't been extracted yet) we fall back to a clean
 * topographic-tinted background so the trail, POIs and live positions still
 * render fully offline. See README for the `pmtiles extract` command.
 */
export function makeStyle(pmtilesUrl: string | null, dark: boolean): StyleSpecification {
  const bg = dark ? "#0b1220" : "#eef3ec";
  const earth = dark ? "#141d2e" : "#e7ecdf";
  const water = dark ? "#0f2036" : "#bcd6e6";
  const green = dark ? "#16261d" : "#d6e6cf";
  const road = dark ? "#2a3547" : "#ffffff";
  const roadCase = dark ? "#0b1220" : "#d8d3c4";

  if (!pmtilesUrl) {
    return {
      version: 8,
      glyphs: undefined,
      sources: {},
      layers: [{ id: "bg", type: "background", paint: { "background-color": bg } }],
    };
  }

  return {
    version: 8,
    glyphs:
      "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`,
        attribution: "© OpenStreetMap · Protomaps",
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": bg } },
      {
        id: "earth",
        type: "fill",
        source: "protomaps",
        "source-layer": "earth",
        paint: { "fill-color": earth },
      },
      {
        id: "landuse",
        type: "fill",
        source: "protomaps",
        "source-layer": "landuse",
        paint: { "fill-color": green, "fill-opacity": 0.7 },
      },
      {
        id: "landcover",
        type: "fill",
        source: "protomaps",
        "source-layer": "landcover",
        paint: { "fill-color": green, "fill-opacity": 0.5 },
      },
      {
        id: "water",
        type: "fill",
        source: "protomaps",
        "source-layer": "water",
        paint: { "fill-color": water },
      },
      {
        id: "roads-case",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        paint: {
          "line-color": roadCase,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 6],
        },
      },
      {
        id: "roads",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        paint: {
          "line-color": road,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 4],
        },
      },
    ],
  };
}
