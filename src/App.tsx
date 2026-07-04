import { useEffect } from "react";
import { Compass, Languages, Siren } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TrekMap } from "@/components/TrekMap";
import { TopBar } from "@/components/TopBar";
import { PositionPanel } from "@/components/PositionPanel";
import { TrailSathi } from "@/components/TrailSathi";
import { BhashaBridge } from "@/components/BhashaBridge";
import { SosCard } from "@/components/SosCard";
import { RescueBrief } from "@/components/RescueBrief";
import { registerPmtilesProtocol } from "@/lib/basemap";
import { loadPack } from "@/lib/trekpack";
import { useApp, type Panel } from "@/state/store";
import { useDemoPeers, useHumsafar } from "@/hooks/useHumsafar";
import { cn } from "@/lib/utils";

registerPmtilesProtocol();

const PANEL_TITLES: Record<Exclude<Panel, null>, string> = {
  sathi: "Trail Sathi",
  bhasha: "Bhasha Bridge",
  sos: "SOS",
};

export default function App() {
  const pack = useApp((s) => s.pack);
  const setPack = useApp((s) => s.setPack);
  const theme = useApp((s) => s.theme);
  const panel = useApp((s) => s.panel);
  const setPanel = useApp((s) => s.setPanel);
  const selfSos = useApp((s) => s.selfSos);

  useHumsafar();
  useDemoPeers();

  useEffect(() => {
    loadPack("triund-indrahar").then(setPack).catch(console.error);
  }, [setPack]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      {pack ? (
        <TrekMap />
      ) : (
        <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
          Opening Trek Pack…
        </div>
      )}

      <TopBar />

      {/* SOS beacon brief from the Humsafar layer */}
      <div className="pointer-events-none absolute inset-x-3 top-24 z-30">
        <RescueBrief />
      </div>

      {/* feature buttons */}
      <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2">
        <Button
          size="icon"
          className="size-12 rounded-full bg-orange-500 shadow-xl hover:bg-orange-600"
          onClick={() => setPanel("sathi")}
          title="Trail Sathi — ask your guide"
        >
          <Compass className="size-5.5 text-white" />
        </Button>
        <Button
          size="icon"
          className="size-12 rounded-full bg-sky-500 shadow-xl hover:bg-sky-600"
          onClick={() => setPanel("bhasha")}
          title="Bhasha Bridge — speak across languages"
        >
          <Languages className="size-5.5 text-white" />
        </Button>
        <Button
          size="icon"
          className={cn(
            "size-12 rounded-full shadow-xl",
            selfSos ? "animate-pulse bg-red-600 hover:bg-red-700" : "bg-red-500 hover:bg-red-600",
          )}
          onClick={() => setPanel("sos")}
          title="SOS — exits, numbers, position code"
        >
          <Siren className="size-5.5 text-white" />
        </Button>
      </div>

      {/* position simulator / demo rig */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
        <div className="mx-auto max-w-xl">
          <PositionPanel />
        </div>
      </div>

      <Sheet open={panel !== null} onOpenChange={(open) => !open && setPanel(null)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetTitle className="sr-only">{panel ? PANEL_TITLES[panel] : ""}</SheetTitle>
          {panel === "sathi" && <TrailSathi />}
          {panel === "bhasha" && <BhashaBridge />}
          {panel === "sos" && <SosCard />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
