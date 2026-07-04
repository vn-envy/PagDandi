import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  Languages,
  Users,
  ShieldAlert,
  Moon,
  Sun,
  Settings,
  Plane,
  MapPin,
  Clock,
  Gauge,
  Mountain,
} from "lucide-react";
import { TrekMap } from "@/components/TrekMap";
import { TrailSathiPanel } from "@/components/TrailSathiPanel";
import { BhashaBridgePanel } from "@/components/BhashaBridgePanel";
import { SosCard } from "@/components/SosCard";
import { HumsafarPanel } from "@/components/HumsafarPanel";
import { SettingsSheet } from "@/components/SettingsSheet";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useWorld } from "@/hooks/useWorld";
import { POI_META, type PoiCategory } from "@/lib/trekpack";
import { Humsafar, type Peer, type TransportKind } from "@/lib/humsafar";
import { probeGemma } from "@/lib/gemma";
import { fmtDistance } from "@/lib/geo";

type Tab = "guide" | "translate" | "humsafar" | "sos";

const TABS: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: "guide", label: "Guide", icon: Compass },
  { id: "translate", label: "Translate", icon: Languages },
  { id: "humsafar", label: "Humsafar", icon: Users },
  { id: "sos", label: "SOS", icon: ShieldAlert },
];

const ALL_CATEGORIES: PoiCategory[] = [
  "viewpoint",
  "campsite",
  "water",
  "shelter",
  "food",
  "exit",
  "summit",
];

export default function App() {
  const {
    manifest,
    trail,
    world,
    fraction,
    setFraction,
    clockOffsetMin,
    setClockOffsetMin,
    paceKmh,
    setPaceKmh,
    now,
  } = useWorld("/trek-packs/triund.json");

  const [dark, setDark] = useState(true);
  const [tab, setTab] = useState<Tab>("guide");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gemmaOnline, setGemmaOnline] = useState(false);
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [visible, setVisible] = useState<Set<PoiCategory>>(new Set(ALL_CATEGORIES));

  // Humsafar
  const humsafarRef = useRef<Humsafar | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [transport, setTransport] = useState<TransportKind>("off");
  const [visibleMode, setVisibleMode] = useState(true);
  const [beaconOn, setBeaconOn] = useState(false);

  // theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // network status (airplane-mode indicator)
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const refreshGemma = useCallback(() => {
    probeGemma().then(setGemmaOnline);
  }, []);
  useEffect(() => {
    refreshGemma();
    const t = setInterval(refreshGemma, 15000);
    return () => clearInterval(t);
  }, [refreshGemma]);

  // Init Humsafar once we have a trek center.
  useEffect(() => {
    if (!manifest || humsafarRef.current) return;
    const h = new Humsafar(
      { id: "me", name: "You", coord: manifest.center },
      {
        onPeers: setPeers,
        onTransport: (kind) => setTransport(kind),
      }
    );
    humsafarRef.current = h;
    return () => {
      h.destroy();
      humsafarRef.current = null;
    };
  }, [manifest]);

  // Push our simulated GPS position to peers as it moves.
  useEffect(() => {
    if (world && humsafarRef.current && visibleMode) {
      humsafarRef.current.updateSelf(world.position, beaconOn ? "sos" : "ok");
    }
  }, [world?.position, visibleMode, beaconOn, world]);

  const sosPeer = peers.find((p) => p.status === "sos");

  const toggleCategory = (c: PoiCategory) => {
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  };

  const clockLabel = useMemo(
    () =>
      now.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
      }),
    [now]
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="z-20 flex items-center gap-2 border-b border-border bg-card/80 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Mountain className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold">
              PagDandi <span className="font-normal text-muted-foreground">· पगडंडी</span>
            </div>
            <div className="text-[10px] text-muted-foreground">an offline sherpa in your pocket</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Badge variant={offline ? "accent" : "muted"} className="hidden sm:flex">
            <Plane className="h-3 w-3" /> {offline ? "Airplane mode" : "Online"}
          </Badge>
          <Badge variant={gemmaOnline ? "default" : "muted"} title="Local Gemma endpoint status">
            {gemmaOnline ? "Gemma E4B ●" : "Gemma offline"}
          </Badge>
          <button
            onClick={() => setDark((d) => !d)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-secondary"
            aria-label="Toggle night trek mode"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-secondary"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[1fr_400px]">
        {/* Map */}
        <div className="relative h-[44vh] min-h-0 lg:h-auto">
          {manifest && (
            <TrekMap
              manifest={manifest}
              trail={trail}
              position={world?.position ?? manifest.center}
              sosTarget={sosPeer?.coord ?? null}
              peers={peers}
              dark={dark}
              visible={visible}
              onPickPoi={() => {}}
            />
          )}

          {/* POI legend / toggles */}
          <div className="pointer-events-auto absolute left-2 top-2 z-10 flex max-w-[70%] flex-wrap gap-1">
            {ALL_CATEGORIES.map((c) => {
              const meta = POI_META[c];
              const on = visible.has(c);
              return (
                <button
                  key={c}
                  onClick={() => toggleCategory(c)}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                    on
                      ? "border-border bg-card/90 text-foreground"
                      : "border-transparent bg-card/40 text-muted-foreground opacity-60"
                  }`}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: meta.color }}
                  />
                  {meta.label}
                </button>
              );
            })}
          </div>

          {/* Position + time controls overlay */}
          <div className="absolute inset-x-2 bottom-2 z-10 rounded-xl border border-border bg-card/90 p-3 backdrop-blur">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {world ? `${Math.round(world.elevation)} m · ${fmtDistance(world.distanceAlong)} in` : "…"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {clockLabel} IST
              </span>
              <span className="flex items-center gap-1">
                <Gauge className="h-3 w-3" /> {paceKmh.toFixed(1)} km/h
              </span>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Position
                </span>
                <Slider
                  value={fraction * 100}
                  onChange={(v) => setFraction(v / 100)}
                  aria-label="GPS position along trail"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Clock
                </span>
                <Slider
                  value={clockOffsetMin}
                  min={-180}
                  max={300}
                  step={5}
                  onChange={setClockOffsetMin}
                  aria-label="Clock offset"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Pace
                </span>
                <Slider
                  value={paceKmh * 10}
                  min={15}
                  max={50}
                  step={1}
                  onChange={(v) => setPaceKmh(v / 10)}
                  aria-label="Walking pace"
                />
              </label>
            </div>
            <div className="mt-1 text-center text-[9px] text-muted-foreground">
              Simulated GPS — drag to demo any position, time and pace on the trail
            </div>
          </div>
        </div>

        {/* Panel */}
        <aside className="flex min-h-0 flex-1 flex-col border-t border-border lg:border-l lg:border-t-0">
          <nav className="flex shrink-0 border-b border-border">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              const alert = t.id === "humsafar" && !!sosPeer;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {alert && (
                    <span className="absolute right-4 top-1 h-2 w-2 animate-pulse rounded-full bg-destructive" />
                  )}
                  {active && (
                    <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="pd-scroll min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "guide" && <TrailSathiPanel world={world} online={gemmaOnline} />}
            {tab === "translate" && <BhashaBridgePanel />}
            {tab === "humsafar" && (
              <HumsafarPanel
                peers={peers}
                transport={transport}
                world={world}
                visibleMode={visibleMode}
                onToggleVisible={setVisibleMode}
                onConnectLan={(url) => humsafarRef.current?.connectLan(url)}
                onStartSim={() => humsafarRef.current?.startSimulator(manifest?.trail ?? [])}
                onDisconnect={() => humsafarRef.current?.disconnect()}
                onTriggerSimSos={() => humsafarRef.current?.triggerSimSos()}
              />
            )}
            {tab === "sos" && (
              <SosCard world={world} beaconOn={beaconOn} onToggleBeacon={setBeaconOn} />
            )}
          </div>
        </aside>
      </div>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={refreshGemma}
      />
    </div>
  );
}
