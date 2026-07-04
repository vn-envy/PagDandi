import { useEffect, useRef, useState } from "react";
import { Radio, Users, Wifi, WifiOff, Siren, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { bearing, compass, fmtDistance, haversine } from "@/lib/geo";
import { isGhost, type Peer, type TransportKind } from "@/lib/humsafar";
import { composeRescueBrief, type AgentAnswer } from "@/lib/gemma";
import type { WorldState } from "@/lib/tools";

interface Props {
  peers: Peer[];
  transport: TransportKind;
  world: WorldState | null;
  visibleMode: boolean;
  onToggleVisible: (v: boolean) => void;
  onConnectLan: (url: string) => void;
  onStartSim: () => void;
  onDisconnect: () => void;
  onTriggerSimSos: () => void;
}

export function HumsafarPanel({
  peers,
  transport,
  world,
  visibleMode,
  onToggleVisible,
  onConnectLan,
  onStartSim,
  onDisconnect,
  onTriggerSimSos,
}: Props) {
  const [lanUrl, setLanUrl] = useState(
    `ws://${typeof location !== "undefined" ? location.hostname : "localhost"}:8787`
  );
  const [brief, setBrief] = useState<AgentAnswer | null>(null);
  const [briefing, setBriefing] = useState(false);
  const lastSosId = useRef<string | null>(null);

  const sosPeer = peers.find((p) => p.status === "sos");

  // When a peer's SOS beacon appears, ask Trail Sathi (Gemma) for a rescue brief.
  useEffect(() => {
    if (!sosPeer || !world) {
      if (!sosPeer) {
        lastSosId.current = null;
        setBrief(null);
      }
      return;
    }
    if (lastSosId.current === sosPeer.id) return;
    lastSosId.current = sosPeer.id;
    setBriefing(true);
    composeRescueBrief(world, {
      name: sosPeer.name,
      coord: sosPeer.coord,
      status: sosPeer.status,
    })
      .then(setBrief)
      .finally(() => setBriefing(false));
  }, [sosPeer, world]);

  const now = Date.now();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Humsafar</span>
        <Badge variant={transport === "off" ? "muted" : "default"} className="ml-auto">
          {transport === "lan" ? "LAN relay" : transport === "simulator" ? "Simulator" : "Off"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Every trekker becomes someone else's safety net. Positions travel
        device-to-device over local radio — no server, ephemeral, opt-in.
        Production uses a BLE mesh (Meshtastic-pattern gossip); see the README.
      </p>

      {/* Opt-in privacy toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          {visibleMode ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {visibleMode ? "Visible to nearby trekkers" : "Ghost mode (hidden)"}
        </div>
        <Switch checked={visibleMode} onCheckedChange={onToggleVisible} aria-label="Visibility" />
      </div>

      {/* Transport controls */}
      <div className="rounded-xl border border-border bg-secondary/40 p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          Transport
        </div>
        <div className="flex items-center gap-2">
          <input
            value={lanUrl}
            onChange={(e) => setLanUrl(e.target.value)}
            className="h-9 flex-1 rounded-lg border border-input bg-background px-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="sm" onClick={() => onConnectLan(lanUrl)}>
            <Wifi className="h-3.5 w-3.5" /> Join
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={onStartSim}>
            <Radio className="h-3.5 w-3.5" /> Start simulator
          </Button>
          <Button size="sm" variant="ghost" onClick={onDisconnect}>
            <WifiOff className="h-3.5 w-3.5" /> Disconnect
          </Button>
          {transport === "simulator" && (
            <Button size="sm" variant="destructive" onClick={onTriggerSimSos}>
              <Siren className="h-3.5 w-3.5" /> Trigger peer SOS
            </Button>
          )}
        </div>
      </div>

      {/* Rescue brief */}
      {sosPeer && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <Siren className="h-4 w-4" /> SOS from {sosPeer.name}
          </div>
          <div className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Trail Sathi rescue brief
          </div>
          {briefing ? (
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reasoning over position, pace & light…
            </div>
          ) : (
            brief && <p className="mt-1 text-sm leading-relaxed">{brief.text}</p>
          )}
        </div>
      )}

      {/* Peer list */}
      <div className="space-y-1.5">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          On the trail near you ({peers.length})
        </div>
        {peers.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            No peers yet. Join a LAN relay on a shared hotspot, or start the labelled simulator.
          </div>
        )}
        {peers.map((p) => {
          const ghost = isGhost(p, now);
          const d = world ? haversine(world.position, p.coord) : 0;
          const b = world ? bearing(world.position, p.coord) : 0;
          return (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background:
                    p.status === "sos" ? "#ef4444" : ghost ? "#94a3b8" : "#22c55e",
                  boxShadow:
                    p.status === "sos" ? "0 0 8px #ef4444" : ghost ? "none" : "0 0 6px #22c55e",
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  {p.name}
                  {p.status === "sos" && <span className="ml-1 font-semibold text-destructive">SOS</span>}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {ghost
                    ? `ghost · last seen ${Math.round((now - p.timestamp) / 60000)} min ago`
                    : world
                      ? `${fmtDistance(d)} · ${compass(b)} (${Math.round(b)}°)`
                      : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
