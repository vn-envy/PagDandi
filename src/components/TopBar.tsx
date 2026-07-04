import { Eye, EyeOff, Moon, Sun, Users, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/state/store";
import { cn } from "@/lib/utils";

export function TopBar() {
  const pack = useApp((s) => s.pack);
  const theme = useApp((s) => s.theme);
  const toggleTheme = useApp((s) => s.toggleTheme);
  const visible = useApp((s) => s.visible);
  const setVisible = useApp((s) => s.setVisible);
  const simulatePeers = useApp((s) => s.simulatePeers);
  const setSimulatePeers = useApp((s) => s.setSimulatePeers);
  const relayConnected = useApp((s) => s.relayConnected);
  const upsertPeer = useApp((s) => s.upsertPeer);
  const peers = useApp((s) => s.peers);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3">
      <div className="pointer-events-auto rounded-xl border bg-background/85 px-3 py-2 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-base font-black tracking-tight">
            पगडंडी <span className="text-muted-foreground font-semibold">PagDandi</span>
          </span>
          <Badge variant="secondary" className="gap-1 text-[9px]">
            <WifiOff className="size-2.5" /> OFFLINE PACK
          </Badge>
        </div>
        <div className="text-muted-foreground mt-0.5 text-[11px]">
          {pack ? `${pack.trek.name} · ${pack.trek.region}` : "Loading Trek Pack…"}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px]">
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              relayConnected ? "bg-emerald-500" : "bg-zinc-400",
            )}
          />
          <span className="text-muted-foreground">
            Humsafar relay: {relayConnected ? "linked (local radio)" : "searching…"}
          </span>
        </div>
      </div>

      <div className="pointer-events-auto flex flex-col items-end gap-1.5">
        <div className="flex gap-1.5">
          <Button
            size="icon"
            variant="secondary"
            className="size-8 shadow-lg"
            onClick={toggleTheme}
            title="Night trek mode"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button
            size="icon"
            variant={visible ? "secondary" : "outline"}
            className="size-8 shadow-lg"
            onClick={() => setVisible(!visible)}
            title={visible ? "Visible to nearby trekkers — tap for ghost mode" : "Ghost mode — position not shared"}
          >
            {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </Button>
          <Button
            size="icon"
            variant={simulatePeers ? "default" : "secondary"}
            className="size-8 shadow-lg"
            onClick={() => setSimulatePeers(!simulatePeers)}
            title="Demo companions (clearly labeled simulated peers)"
          >
            <Users className="size-4" />
          </Button>
        </div>
        {simulatePeers && peers["demo-1"] && (
          <Button
            size="sm"
            variant="destructive"
            className="h-7 text-[11px] shadow-lg"
            onClick={() =>
              upsertPeer({
                ...peers["demo-1"],
                status: peers["demo-1"].status === "sos" ? "ok" : "sos",
                ts: Date.now(),
              })
            }
          >
            {peers["demo-1"].status === "sos" ? "Stand down demo SOS" : "Demo: Lobsang triggers SOS"}
          </Button>
        )}
      </div>
    </div>
  );
}
