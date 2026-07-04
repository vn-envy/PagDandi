import { useMemo, useRef } from "react";
import {
  Map as MapCn,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerPopup,
  type MapRef,
} from "@/components/ui/map";
import {
  Coffee,
  Droplets,
  Eye,
  Flag,
  Home,
  Landmark,
  LogOut,
  Mountain,
  Tent,
} from "lucide-react";
import { offlineStyle } from "@/lib/basemap";
import { bearing, compass, fmtDistance, haversine } from "@/lib/geo";
import type { Poi, PoiCategory } from "@/lib/trekpack";
import { useApp } from "@/state/store";
import { STALE_MS } from "@/hooks/useHumsafar";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const CATEGORY_STYLE: Record<
  PoiCategory,
  { icon: typeof Eye; className: string; label: string }
> = {
  viewpoint: { icon: Eye, className: "bg-violet-500", label: "Viewpoint" },
  campsite: { icon: Tent, className: "bg-emerald-600", label: "Campsite" },
  water: { icon: Droplets, className: "bg-sky-500", label: "Water source" },
  shelter: { icon: Home, className: "bg-amber-600", label: "Shelter" },
  cafe: { icon: Coffee, className: "bg-orange-500", label: "Café / dhaba" },
  temple: { icon: Landmark, className: "bg-rose-400", label: "Temple" },
  peak: { icon: Mountain, className: "bg-slate-600", label: "Peak / pass" },
  waypoint: { icon: Flag, className: "bg-indigo-500", label: "Waypoint" },
};

function PoiPopupBody({ poi }: { poi: Poi }) {
  const position = useApp((s) => s.position)();
  const d = haversine({ lng: position.lng, lat: position.lat }, { lng: poi.lon, lat: poi.lat });
  const b = bearing({ lng: position.lng, lat: position.lat }, { lng: poi.lon, lat: poi.lat });
  const meta = CATEGORY_STYLE[poi.category];
  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold leading-tight">{poi.name ?? meta.label}</div>
      <div className="text-muted-foreground text-xs">
        {meta.label}
        {poi.ele ? ` · ${poi.ele} m` : ""}
      </div>
      <div className="text-xs">
        {fmtDistance(d)} {compass(b)} of you
      </div>
    </div>
  );
}

export function TrekMap() {
  const pack = useApp((s) => s.pack);
  const theme = useApp((s) => s.theme);
  const distM = useApp((s) => s.distM);
  const peers = useApp((s) => s.peers);
  const selfSos = useApp((s) => s.selfSos);
  const selfName = useApp((s) => s.selfName);
  const position = useApp((s) => s.position)();
  const mapRef = useRef<MapRef>(null);

  const styles = useMemo(() => {
    if (!pack) return undefined;
    return {
      light: offlineStyle(pack.trek.id, "light"),
      dark: offlineStyle(pack.trek.id, "dark"),
    };
  }, [pack]);

  const trailCoords = useMemo(
    () => (pack ? pack.trail.map((v) => [v[0], v[1]] as [number, number]) : []),
    [pack],
  );
  const walkedCoords = useMemo(() => {
    if (!pack) return [];
    const done = pack.trail.filter((v) => v[3] <= distM).map((v) => [v[0], v[1]] as [number, number]);
    return done.length >= 2 ? done : [];
  }, [pack, distM]);

  if (!pack || !styles) return null;

  return (
    <MapCn
      ref={mapRef}
      theme={theme}
      styles={styles}
      center={[76.349, 32.2695]}
      zoom={12.6}
      pitch={40}
      minZoom={10}
      maxZoom={15.9}
      className="absolute inset-0"
      attributionControl={false}
    >
      {/* trail: full line + walked portion highlighted */}
      <MapRoute
        id="trail"
        coordinates={trailCoords}
        color={theme === "dark" ? "#f97316" : "#ea580c"}
        width={3.5}
        opacity={0.9}
        interactive={false}
      />
      {walkedCoords.length > 0 && (
        <MapRoute
          id="trail-walked"
          coordinates={walkedCoords}
          color={theme === "dark" ? "#38bdf8" : "#0284c7"}
          width={4.5}
          opacity={0.95}
          interactive={false}
        />
      )}

      {/* POI layers */}
      {pack.pois.map((poi) => {
        const meta = CATEGORY_STYLE[poi.category];
        const Icon = meta.icon;
        return (
          <MapMarker key={poi.id} longitude={poi.lon} latitude={poi.lat}>
            <MarkerContent>
              <div
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border-2 border-white/90 text-white shadow-md dark:border-black/50",
                  meta.className,
                )}
              >
                <Icon className="size-3.5" />
              </div>
            </MarkerContent>
            <MarkerPopup closeButton>
              <PoiPopupBody poi={poi} />
            </MarkerPopup>
          </MapMarker>
        );
      })}

      {/* exit / SOS points */}
      {pack.exits.map((exit) => (
        <MapMarker key={exit.id} longitude={exit.lon} latitude={exit.lat}>
          <MarkerContent>
            <div className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-green-600 text-white shadow-lg dark:border-black/50">
              <LogOut className="size-4" />
            </div>
          </MarkerContent>
          <MarkerPopup closeButton>
            <div className="space-y-1">
              <div className="text-sm font-semibold">{exit.name}</div>
              <Badge variant="secondary" className="text-[10px]">
                EXIT POINT · {exit.ele} m
              </Badge>
              <p className="text-muted-foreground text-xs">{exit.note}</p>
            </div>
          </MarkerPopup>
        </MapMarker>
      ))}

      {/* Humsafar peers */}
      {Object.values(peers).map((peer) => {
        const stale = Date.now() - peer.ts > STALE_MS;
        const sos = peer.status === "sos";
        const agoMin = Math.round((Date.now() - peer.ts) / 60000);
        return (
          <MapMarker key={peer.id} longitude={peer.lng} latitude={peer.lat}>
            <MarkerContent>
              <div className="relative flex flex-col items-center">
                <span
                  className={cn(
                    "relative block size-4 rounded-full border-2 border-white shadow-lg dark:border-black/60",
                    sos
                      ? "pd-pulse pd-pulse-fast bg-red-500 text-red-500"
                      : stale
                        ? "bg-zinc-400 text-zinc-400 opacity-60"
                        : "pd-pulse bg-emerald-400 text-emerald-400",
                  )}
                />
                <span className="text-foreground absolute top-full mt-1 rounded bg-background/80 px-1 text-[9px] font-semibold whitespace-nowrap backdrop-blur-sm">
                  {peer.name}
                  {peer.simulated ? " · DEMO" : ""}
                  {sos ? " · SOS" : stale ? ` · seen ${agoMin}m ago` : ""}
                </span>
              </div>
            </MarkerContent>
            <MarkerPopup closeButton>
              <div className="space-y-1">
                <div className="text-sm font-semibold">
                  {peer.name}
                  {peer.simulated && (
                    <Badge variant="outline" className="ml-1.5 text-[9px]">
                      SIMULATED
                    </Badge>
                  )}
                </div>
                <div className={cn("text-xs font-medium", sos ? "text-red-500" : "text-emerald-600")}>
                  {sos ? "SOS BEACON ACTIVE" : "On trail"}
                </div>
                <div className="text-muted-foreground text-xs">
                  {peer.ele ? `${peer.ele} m · ` : ""}
                  {fmtDistance(
                    haversine({ lng: position.lng, lat: position.lat }, { lng: peer.lng, lat: peer.lat }),
                  )}{" "}
                  {compass(
                    bearing({ lng: position.lng, lat: position.lat }, { lng: peer.lng, lat: peer.lat }),
                  )}{" "}
                  of you · seen {agoMin < 1 ? "now" : `${agoMin} min ago`}
                </div>
              </div>
            </MarkerPopup>
          </MapMarker>
        );
      })}

      {/* you */}
      <MapMarker longitude={position.lng} latitude={position.lat}>
        <MarkerContent>
          <div className="relative flex flex-col items-center">
            <span
              className={cn(
                "relative block size-5 rounded-full border-[3px] border-white shadow-xl dark:border-black/60",
                selfSos
                  ? "pd-pulse pd-pulse-fast bg-red-500 text-red-500"
                  : "pd-pulse bg-blue-500 text-blue-500",
              )}
            />
            <span className="text-foreground absolute top-full mt-1 rounded bg-background/80 px-1 text-[9px] font-bold whitespace-nowrap backdrop-blur-sm">
              {selfName} (you)
            </span>
          </div>
        </MarkerContent>
      </MapMarker>

      <MapControls position="bottom-right" showZoom showCompass />
      <div className="text-muted-foreground pointer-events-none absolute bottom-0.5 left-1 z-10 text-[8px]">
        © OpenStreetMap contributors · Protomaps
      </div>
    </MapCn>
  );
}
