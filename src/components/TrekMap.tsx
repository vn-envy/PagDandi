import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { makeStyle } from "@/lib/mapstyle";
import type { LngLat, TrailPoint } from "@/lib/geo";
import {
  POI_META,
  type Poi,
  type PoiCategory,
  type TrekPackManifest,
} from "@/lib/trekpack";
import { isGhost, type Peer } from "@/lib/humsafar";

let protocolRegistered = false;

interface TrekMapProps {
  manifest: TrekPackManifest;
  trail: TrailPoint[];
  position: LngLat;
  sosTarget?: LngLat | null;
  peers: Peer[];
  dark: boolean;
  visible: Set<PoiCategory>;
  onPickPoi?: (poi: Poi) => void;
}

export function TrekMap({
  manifest,
  trail,
  position,
  sosTarget,
  peers,
  dark,
  visible,
  onPickPoi,
}: TrekMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const poiMarkers = useRef<maplibregl.Marker[]>([]);
  const peerMarkers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const posMarker = useRef<maplibregl.Marker | null>(null);
  const readyRef = useRef(false);

  const trailGeoJSON = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: trail.map((t) => t.coord),
          },
          properties: {},
        },
      ],
    }),
    [trail]
  );

  // ---- init map once -----------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!protocolRegistered) {
      const protocol = new Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      protocolRegistered = true;
    }

    let pmtilesUrl: string | null = null;
    const boot = async () => {
      // Detect whether the offline vector bundle is actually present.
      if (manifest.pmtiles) {
        try {
          const head = await fetch(manifest.pmtiles, { method: "HEAD" });
          if (head.ok) pmtilesUrl = manifest.pmtiles;
        } catch {
          pmtilesUrl = null;
        }
      }

      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: makeStyle(pmtilesUrl, dark),
        center: manifest.center,
        zoom: 13.2,
        maxBounds: [
          [manifest.bbox[0] - 0.05, manifest.bbox[1] - 0.05],
          [manifest.bbox[2] + 0.05, manifest.bbox[3] + 0.05],
        ],
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
      map.addControl(
        new maplibregl.AttributionControl({ compact: true, customAttribution: manifest.attribution }),
        "bottom-right"
      );

      map.on("load", () => {
        readyRef.current = true;
        map.addSource("trail", { type: "geojson", data: trailGeoJSON });
        map.addLayer({
          id: "trail-glow",
          type: "line",
          source: "trail",
          paint: {
            "line-color": dark ? "#f59e0b" : "#ea580c",
            "line-width": 8,
            "line-blur": 6,
            "line-opacity": 0.35,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: "trail-line",
          type: "line",
          source: "trail",
          paint: {
            "line-color": dark ? "#fbbf24" : "#c2410c",
            "line-width": 3.5,
            "line-dasharray": [2, 1.2],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addSource("sos", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "sos-line",
          type: "line",
          source: "sos",
          paint: { "line-color": "#ef4444", "line-width": 2.5, "line-dasharray": [1, 1] },
        });
        renderPois();
        renderPosition();
      });
    };
    void boot();

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- restyle on theme change ------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setPaintProperty("trail-line", "line-color", dark ? "#fbbf24" : "#c2410c");
    map.setPaintProperty("trail-glow", "line-color", dark ? "#f59e0b" : "#ea580c");
    const bg = dark ? "#0b1220" : "#eef3ec";
    if (map.getLayer("bg")) map.setPaintProperty("bg", "background-color", bg);
  }, [dark]);

  // ---- POI markers -------------------------------------------------------
  function renderPois() {
    const map = mapRef.current;
    if (!map) return;
    poiMarkers.current.forEach((m) => m.remove());
    poiMarkers.current = [];
    for (const poi of manifest.pois) {
      if (!visible.has(poi.category)) continue;
      const meta = POI_META[poi.category];
      const el = document.createElement("div");
      el.className = "pd-marker";
      const chip = document.createElement("div");
      chip.className = "pd-poi";
      chip.style.background = meta.color;
      chip.style.fontSize = "13px";
      chip.textContent = meta.emoji;
      el.appendChild(chip);
      const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
        `<div style="font-weight:600;font-size:13px">${meta.emoji} ${poi.name}</div>
         <div style="font-size:11px;opacity:.7;margin-top:2px">${meta.label}${
           poi.ele ? ` · ${poi.ele} m` : ""
         }</div>${
           poi.note ? `<div style="font-size:11px;margin-top:4px">${poi.note}</div>` : ""
         }`
      );
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(poi.coord)
        .setPopup(popup)
        .addTo(map);
      el.addEventListener("click", () => onPickPoi?.(poi));
      poiMarkers.current.push(marker);
    }
  }

  useEffect(() => {
    if (readyRef.current) renderPois();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, manifest]);

  // ---- position dot ------------------------------------------------------
  function renderPosition() {
    const map = mapRef.current;
    if (!map) return;
    if (!posMarker.current) {
      const el = document.createElement("div");
      el.className = "pd-marker";
      el.innerHTML = `<div class="pd-pulse"></div><div class="pd-gps-dot"></div>`;
      posMarker.current = new maplibregl.Marker({ element: el }).setLngLat(position).addTo(map);
    } else {
      posMarker.current.setLngLat(position);
    }
  }

  useEffect(() => {
    if (readyRef.current) {
      renderPosition();
      mapRef.current?.easeTo({ center: position, duration: 600 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  // ---- SOS bearing line --------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource("sos") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: sosTarget
        ? [
            {
              type: "Feature",
              geometry: { type: "LineString", coordinates: [position, sosTarget] },
              properties: {},
            },
          ]
        : [],
    });
  }, [sosTarget, position]);

  // ---- Humsafar peers ----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const now = Date.now();
    const seen = new Set<string>();
    for (const peer of peers) {
      seen.add(peer.id);
      const ghost = isGhost(peer, now);
      let marker = peerMarkers.current.get(peer.id);
      if (!marker) {
        const el = document.createElement("div");
        el.className = "pd-marker";
        marker = new maplibregl.Marker({ element: el }).setLngLat(peer.coord).addTo(map);
        peerMarkers.current.set(peer.id, marker);
      }
      const el = marker.getElement();
      const cls = ["pd-marker", "pd-peer"];
      if (peer.status === "sos") cls.push("pd-peer--sos");
      else if (ghost) cls.push("pd-peer--ghost");
      el.className = cls.join(" ");
      const label = ghost
        ? `${peer.name} · seen ${Math.round((now - peer.timestamp) / 60000)}m ago`
        : peer.status === "sos"
          ? `SOS · ${peer.name}`
          : peer.name;
      el.innerHTML = `<div class="pd-peer-pulse"></div><div class="pd-peer-dot"></div><div class="pd-peer-label">${label}</div>`;
      marker.setLngLat(peer.coord);
    }
    for (const [id, marker] of peerMarkers.current) {
      if (!seen.has(id)) {
        marker.remove();
        peerMarkers.current.delete(id);
      }
    }
  }, [peers]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
