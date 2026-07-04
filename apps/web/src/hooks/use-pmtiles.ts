"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";

type MapTheme = "light" | "dark";

let protocolRegistered = false;

export function usePmtilesProtocol() {
  useEffect(() => {
    if (protocolRegistered) return;
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    protocolRegistered = true;
  }, []);
}

export function buildOfflineStyle(
  pmtilesUrl: string,
  theme: MapTheme = "light",
): maplibregl.StyleSpecification {
  const flavor = theme === "dark" ? namedFlavor("dark") : namedFlavor("light");
  return {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite: "https://protomaps.github.io/basemaps-assets/sprites/v4/light",
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers("protomaps", flavor, { lang: "en" }),
  };
}

export function usePmtilesLayer(
  map: maplibregl.Map | null,
  isLoaded: boolean,
  pmtilesPath: string,
  theme: MapTheme,
) {
  const styleRef = useRef<string>("");

  useEffect(() => {
    if (!map || !isLoaded) return;
    const style = buildOfflineStyle(pmtilesPath, theme);
    const key = `${pmtilesPath}-${theme}`;
    if (styleRef.current === key) return;
    styleRef.current = key;
    map.setStyle(style);
  }, [map, isLoaded, pmtilesPath, theme]);
}
