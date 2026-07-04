import { useEffect, useRef, useState } from "react";
import { Siren, X } from "lucide-react";
import { useApp } from "@/state/store";
import { llmStatus, rescueBrief, type SathiReply } from "@/lib/gemma";

/**
 * When an SOS beacon appears on the Humsafar layer, Trail Sathi composes a
 * situational brief: raw peer data in, a decision out.
 */
export function RescueBrief() {
  const peers = useApp((s) => s.peers);
  const pack = useApp((s) => s.pack);
  const [brief, setBrief] = useState<{ name: string; reply: SathiReply; model: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const knownSos = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!pack) return;
    for (const p of Object.values(peers)) {
      if (p.status === "sos" && !knownSos.current.has(p.id)) {
        knownSos.current.add(p.id);
        setBusy(true);
        const s = useApp.getState();
        (async () => {
          const status = await llmStatus();
          const reply = await rescueBrief(
            { peerName: p.name, peerLat: p.lat, peerLng: p.lng, ctx: { pack, position: s.position(), now: s.now() } },
            status.up,
          );
          setBrief({ name: p.name, reply, model: status.model });
          setBusy(false);
        })();
      }
      if (p.status !== "sos") knownSos.current.delete(p.id);
    }
  }, [peers, pack]);

  if (busy) {
    return (
      <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-2 rounded-xl border-2 border-red-500 bg-background/95 px-4 py-3 shadow-2xl backdrop-blur">
        <Siren className="size-4 animate-pulse text-red-500" />
        <span className="text-xs font-medium">SOS beacon received — Sathi is composing your brief…</span>
      </div>
    );
  }
  if (!brief) return null;

  return (
    <div className="pointer-events-auto mx-auto max-w-md rounded-xl border-2 border-red-500 bg-background/95 p-4 shadow-2xl backdrop-blur">
      <div className="mb-1.5 flex items-center gap-2">
        <Siren className="size-4 text-red-500" />
        <span className="flex-1 text-sm font-bold text-red-500">SOS — {brief.name}</span>
        <button onClick={() => setBrief(null)} aria-label="Dismiss">
          <X className="text-muted-foreground size-4" />
        </button>
      </div>
      <p className="text-sm leading-snug">{brief.reply.answer}</p>
      <div className="text-muted-foreground mt-2 text-[9px] uppercase tracking-wide">
        {brief.reply.source === "gemma"
          ? `Situational brief · ${brief.model ?? "local model"} on-device`
          : "Situational brief · Pack Brain (deterministic)"}
      </div>
    </div>
  );
}
