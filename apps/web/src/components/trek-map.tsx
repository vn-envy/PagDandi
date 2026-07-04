"use client";

import { useEffect, useMemo } from "react";
import { useTheme } from "next-themes";
import {
  Map,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerLabel,
  MarkerPopup,
  useMap,
} from "@/components/ui/map";
import { usePmtilesProtocol } from "@/hooks/use-pmtiles";
import { buildOfflineStyle } from "@/hooks/use-pmtiles";
import type { PeerState, PoiFeature, Position, TrekManifest } from "@/lib/types";
import { POI_COLORS, POI_LABELS } from "@/lib/types";
import { isPeerStale } from "@/lib/geo";
import { cn } from "@/lib/utils";
import {
  Binoculars,
  Droplets,
  Home,
  LogOut,
  Mountain,
  Siren,
  Tent,
} from "lucide-react";

const POI_ICONS = {
  viewpoint: Binoculars,
  campsite: Tent,
  water: Droplets,
  shelter: Home,
  exit: LogOut,
  sos: Siren,
};

function PmtilesStyleSync({ pmtilesPath }: { pmtilesPath: string }) {
  const { map, isLoaded, resolvedTheme } = useMap();
  const { theme } = useTheme();
  const activeTheme = theme === "system" ? resolvedTheme : (theme as "light" | "dark");

  useEffect(() => {
    if (!map || !isLoaded) return;
    map.setStyle(buildOfflineStyle(pmtilesPath, activeTheme ?? "dark"));
  }, [map, isLoaded, pmtilesPath, activeTheme]);

  return null;
}

function PeerMarker({ peer, staleMs }: { peer: PeerState; staleMs: number }) {
  const stale = isPeerStale(peer.timestamp, staleMs);
  const isSos = peer.status === "sos";

  return (
    <MapMarker longitude={peer.lng} latitude={peer.lat}>
      <MarkerContent>
        <div className="relative flex items-center justify-center">
          <span
            className={cn(
              "absolute size-8 rounded-full animate-ping opacity-40",
              isSos ? "bg-red-500" : stale ? "bg-muted-foreground" : "bg-emerald-400",
            )}
          />
          <span
            className={cn(
              "relative size-4 rounded-full border-2 border-white shadow-lg",
              isSos ? "bg-red-500" : stale ? "bg-muted-foreground/60" : "bg-emerald-400",
            )}
          />
        </div>
      </MarkerContent>
      <MarkerLabel position="top">
        <span className={cn("rounded px-1 py-0.5 text-[9px]", stale && "opacity-50")}>
          {peer.name}
          {stale ? " (ghost)" : ""}
          {isSos ? " SOS" : ""}
        </span>
      </MarkerLabel>
    </MapMarker>
  );
}

function PoiMarker({ poi }: { poi: PoiFeature }) {
  const Icon = POI_ICONS[poi.type];
  const color = POI_COLORS[poi.type];

  return (
    <MapMarker longitude={poi.lng} latitude={poi.lat}>
      <MarkerContent>
        <div
          className="flex size-7 items-center justify-center rounded-full border-2 border-white shadow-md"
          style={{ backgroundColor: color }}
        >
          <Icon className="size-3.5 text-white" />
        </div>
      </MarkerContent>
      <MarkerPopup closeButton>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{POI_LABELS[poi.type]}</p>
          <p className="font-semibold">{poi.name}</p>
          <p className="text-xs">{poi.elevationM}m</p>
          {poi.description && (
            <p className="text-xs text-muted-foreground">{poi.description}</p>
          )}
        </div>
      </MarkerPopup>
    </MapMarker>
  );
}

function YouMarker({ position }: { position: Position }) {
  return (
    <MapMarker longitude={position.lng} latitude={position.lat} draggable={false}>
      <MarkerContent>
        <div className="relative flex items-center justify-center">
          <span className="absolute size-10 rounded-full bg-blue-400/30 animate-pulse" />
          <span className="relative size-5 rounded-full border-[3px] border-white bg-blue-500 shadow-xl ring-2 ring-blue-300/50" />
        </div>
      </MarkerContent>
      <MarkerLabel position="bottom">
        <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          You · {position.elevationM}m
        </span>
      </MarkerLabel>
    </MapMarker>
  );
}

interface TrekMapProps {
  manifest: TrekManifest;
  trailCoords: [number, number][];
  pois: PoiFeature[];
  position: Position;
  peers: PeerState[];
  staleMs: number;
  showPoiLayers: Record<string, boolean>;
}

export function TrekMap({
  manifest,
  trailCoords,
  pois,
  position,
  peers,
  staleMs,
  showPoiLayers,
}: TrekMapProps) {
  usePmtilesProtocol();

  const visiblePois = useMemo(
    () => pois.filter((p) => showPoiLayers[p.type] !== false),
    [pois, showPoiLayers],
  );

  const offlineStyle = useMemo(
    () => buildOfflineStyle(manifest.pmtiles, "dark"),
    [manifest.pmtiles],
  );

  return (
    <div className="relative h-full w-full">
      <Map
        center={manifest.center}
        zoom={manifest.defaultZoom}
        className="h-full w-full rounded-xl"
        theme="dark"
        styles={{ light: offlineStyle, dark: offlineStyle }}
      >
        <PmtilesStyleSync pmtilesPath={manifest.pmtiles} />
        <MapControls showZoom showCompass position="bottom-right" />
        <MapRoute
          coordinates={trailCoords}
          color="#f97316"
          width={4}
          opacity={0.9}
          interactive={false}
        />
        {visiblePois.map((poi) => (
          <PoiMarker key={poi.id} poi={poi} />
        ))}
        <YouMarker position={position} />
        {peers.map((peer) => (
          <PeerMarker key={peer.id} peer={peer} staleMs={staleMs} />
        ))}
        <MapMarker longitude={manifest.summit.lng} latitude={manifest.summit.lat}>
          <MarkerContent>
            <Mountain className="size-6 text-amber-400 drop-shadow" />
          </MarkerContent>
          <MarkerLabel>{manifest.summit.name}</MarkerLabel>
        </MapMarker>
      </Map>
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border bg-background/80 px-3 py-2 text-xs backdrop-blur-sm">
        <p className="font-semibold">✈️ Offline · PMTiles</p>
        <p className="text-muted-foreground">{manifest.name}</p>
      </div>
    </div>
  );
}
