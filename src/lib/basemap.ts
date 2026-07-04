import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

/**
 * Offline basemap: a Protomaps flavor style pointed at the Trek Pack's local
 * PMTiles bundle, with glyphs & sprites vendored into public/basemap-assets.
 * Zero network requests after the pack is on the device.
 */

let protocolRegistered = false;
export function registerPmtilesProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

const ASSETS = `${location.origin}${import.meta.env.BASE_URL}basemap-assets`;

export function offlineStyle(packId: string, flavor: "light" | "dark"): StyleSpecification {
  const pmtilesUrl = `pmtiles://${location.origin}${import.meta.env.BASE_URL}packs/${packId}/map.pmtiles`;
  return {
    version: 8,
    glyphs: `${ASSETS}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${ASSETS}/sprites/${flavor}`,
    sources: {
      protomaps: {
        type: "vector",
        url: pmtilesUrl,
        attribution: "© OpenStreetMap contributors, Protomaps",
      },
    },
    layers: layers("protomaps", namedFlavor(flavor), { lang: "en" }),
  };
}
