"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Footprints, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrekMap } from "@/components/trek-map";
import { TrailSathi } from "@/components/trail-sathi";
import { BhashaBridge } from "@/components/bhasha-bridge";
import { SosCard } from "@/components/sos-card";
import { HumsafarPanel } from "@/components/humsafar-panel";
import { NightTrekToggle } from "@/components/night-trek-toggle";
import { ElevationProfile } from "@/components/elevation-profile";
import { PrakritiLens } from "@/components/prakriti-lens";
import { SosAlertBanner } from "@/components/sos-alert-banner";
import { PoiLayerToggle } from "@/components/poi-layer-toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useHumsafar } from "@/hooks/use-humsafar";
import { interpolatePosition, snapToTrail } from "@/lib/geo";
import { triundManifest, triundPois, triundTrailCoords } from "@/data/triund-pack";
import type { PoiType } from "@/lib/types";

const DEFAULT_KM = 5.1;

export default function PagDandiApp() {
  const manifest = triundManifest;
  const trailCoords = triundTrailCoords;
  const pois = triundPois;
  const [kmAlongTrail, setKmAlongTrail] = useState(DEFAULT_KM);
  const [humsafarEnabled, setHumsafarEnabled] = useState(true);

  // Real GPS, snapped to the trail. Manual drag exits follow mode (map-app convention).
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<"off" | "locating" | "on" | "error">("off");
  const [offTrailKm, setOffTrailKm] = useState(0);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gpsEnabled) {
      if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
      watchRef.current = null;
      setGpsStatus("off");
      return;
    }
    if (!("geolocation" in navigator)) {
      setGpsStatus("error");
      return;
    }
    setGpsStatus("locating");
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const snapped = snapToTrail(triundManifest, pos.coords.latitude, pos.coords.longitude);
        setKmAlongTrail(snapped.kmAlongTrail);
        setOffTrailKm(snapped.offTrailKm);
        setGpsStatus("on");
      },
      () => setGpsStatus("error"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => {
      if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
      watchRef.current = null;
    };
  }, [gpsEnabled]);

  const handleManualKm = useCallback((km: number) => {
    setGpsEnabled(false); // dragging the rig exits GPS follow
    setKmAlongTrail(km);
  }, []);
  const [visible, setVisible] = useState(true);
  // Random IDs must be generated after mount — during SSR they'd differ
  // from the client render and break hydration (killing all interactivity).
  const [peerId, setPeerId] = useState("");
  const [peerName, setPeerName] = useState("");
  useEffect(() => {
    setPeerId(crypto.randomUUID());
    setPeerName(`Trekker-${Math.random().toString(36).slice(2, 5)}`);
  }, []);

  const [poiLayers, setPoiLayers] = useState<Record<string, boolean>>({
    viewpoint: true,
    campsite: true,
    water: true,
    shelter: true,
    exit: true,
    sos: true,
  });

  const position = useMemo(
    () => interpolatePosition(manifest, kmAlongTrail),
    [manifest, kmAlongTrail],
  );

  const { peers, connected, sosAlert, clearSosAlert, triggerSos, staleMs } =
    useHumsafar(
      peerId,
      peerName,
      position,
      humsafarEnabled && peerId !== "",
    );

  const togglePoiLayer = (type: PoiType) =>
    setPoiLayers((l) => ({ ...l, [type]: l[type] === false }));

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {sosAlert && (
        <SosAlertBanner
          sosPeer={sosAlert}
          position={position}
          kmAlongTrail={kmAlongTrail}
          onDismiss={clearSosAlert}
        />
      )}

      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl">
        <Footprints className="size-6 text-foreground" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold tracking-tight">
            PagDandi <span className="font-normal text-muted-foreground">पगडंडी</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Offline sherpa · {manifest.region}
          </p>
        </div>
        <Badge variant="outline" className="hidden sm:flex">
          Gemma 4 E4B on-device
        </Badge>
        <Button
          variant={gpsEnabled ? "default" : "outline"}
          size="sm"
          onClick={() => setGpsEnabled((v) => !v)}
          title="Follow my GPS, snapped to the trail"
          className="gap-1.5"
        >
          <LocateFixed
            className={`size-4 ${gpsStatus === "locating" ? "animate-pulse" : ""}`}
          />
          <span className="hidden text-xs sm:inline">
            {gpsStatus === "on"
              ? offTrailKm > 0.15
                ? `${(offTrailKm * 1000).toFixed(0)}m off trail`
                : "On trail"
              : gpsStatus === "locating"
                ? "Locating…"
                : gpsStatus === "error"
                  ? "GPS unavailable"
                  : "Use my GPS"}
          </span>
        </Button>
        <NightTrekToggle />
      </header>

      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-3">
          <div className="relative h-[48vh] min-h-[340px] lg:h-[calc(100vh-16.5rem)]">
            <TrekMap
              manifest={manifest}
              trailCoords={trailCoords}
              pois={pois}
              position={position}
              peers={peers}
              staleMs={staleMs}
              showPoiLayers={poiLayers}
            />
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10">
              <PoiLayerToggle layers={poiLayers} onToggle={togglePoiLayer} />
            </div>
          </div>
          <ElevationProfile
            manifest={manifest}
            kmAlongTrail={kmAlongTrail}
            onKmChange={handleManualKm}
          />
        </div>

        <div className="flex flex-col gap-4">
          <Tabs defaultValue="sathi">
            <TabsList className="w-full">
              <TabsTrigger value="sathi" className="flex-1">
                Trail Sathi
              </TabsTrigger>
              <TabsTrigger value="bhasha" className="flex-1">
                Bhasha
              </TabsTrigger>
              <TabsTrigger value="lens" className="flex-1">
                Lens
              </TabsTrigger>
              <TabsTrigger value="sos" className="flex-1">
                SOS
              </TabsTrigger>
            </TabsList>
            <TabsContent value="sathi" className="mt-3 min-h-[320px]">
              <TrailSathi
                manifest={manifest}
                kmAlongTrail={kmAlongTrail}
                onKmChange={handleManualKm}
              />
            </TabsContent>
            <TabsContent value="bhasha" className="mt-3">
              <BhashaBridge />
            </TabsContent>
            <TabsContent value="lens" className="mt-3">
              <PrakritiLens kmAlongTrail={kmAlongTrail} />
            </TabsContent>
            <TabsContent value="sos" className="mt-3 space-y-3">
              <HumsafarPanel
                enabled={humsafarEnabled}
                onEnabledChange={setHumsafarEnabled}
                connected={connected}
                peerCount={peers.length}
                onTriggerSos={triggerSos}
                visible={visible}
                onVisibleChange={setVisible}
              />
              <SosCard kmAlongTrail={kmAlongTrail} sosPeer={sosAlert} />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <footer className="border-t px-4 py-2 text-center text-[10px] text-muted-foreground">
        No signal. No server. The trail is the network. · Open source · MIT
      </footer>
    </div>
  );
}
