import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Copy, Phone, Radio, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { bearing, compass, fmtDistance, haversine } from "@/lib/geo";
import { nearest } from "@/lib/tools";
import type { WorldState } from "@/lib/tools";
import { makeShare } from "@/lib/sos";

interface Props {
  world: WorldState | null;
  beaconOn: boolean;
  onToggleBeacon: (on: boolean) => void;
}

export function SosCard({ world, beaconOn, onToggleBeacon }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const share = useMemo(
    () => (world ? makeShare(world.position, world.elevation, world.now) : null),
    [world]
  );

  const exit = world ? nearest(world, "exit") : null;
  const shelter = world ? nearest(world, "shelter") : null;

  const exitBrg = useMemo(() => {
    if (!world || !exit?.ok) return null;
    const target = world.manifest.pois.find((p) => p.name === exit.data.name);
    if (!target) return null;
    return {
      dist: haversine(world.position, target.coord),
      brg: bearing(world.position, target.coord),
      name: target.name,
    };
  }, [world, exit]);

  useEffect(() => {
    if (share) QRCode.toDataURL(share.text, { margin: 1, width: 220 }).then(setQr).catch(() => {});
  }, [share]);

  async function copy() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  if (!world) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-destructive" />
        <span className="text-sm font-semibold">SOS Card</span>
        <Badge variant="destructive" className="ml-auto">
          Navigation & signalling only
        </Badge>
      </div>

      <button
        onClick={() => onToggleBeacon(!beaconOn)}
        className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
          beaconOn
            ? "bg-destructive text-destructive-foreground animate-pulse"
            : "border border-destructive/60 text-destructive hover:bg-destructive/10"
        }`}
      >
        <Radio className="h-4 w-4" />
        {beaconOn ? "SOS BEACON ON — visible to nearby trekkers" : "Broadcast SOS to nearby trekkers"}
      </button>
      <p className="-mt-1 text-[11px] text-muted-foreground">
        The nearest human is almost always faster than the nearest helicopter.
        Your beacon turns your dot red on every phone in radio range.
      </p>

      <div className="grid grid-cols-1 gap-2">
        {exitBrg && (
          <div className="rounded-xl border border-border bg-secondary/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Nearest exit
            </div>
            <div className="mt-0.5 text-sm font-medium">{exitBrg.name}</div>
            <div className="text-xs text-muted-foreground">
              {fmtDistance(exitBrg.dist)} · bearing {Math.round(exitBrg.brg)}° ({compass(exitBrg.brg)})
            </div>
          </div>
        )}
        {shelter?.ok && (
          <div className="rounded-xl border border-border bg-secondary/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Nearest shelter
            </div>
            <div className="mt-0.5 text-sm">{shelter.summary}</div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          Emergency numbers
        </div>
        <div className="flex flex-wrap gap-1.5">
          {world.manifest.emergency.map((c) => (
            <a
              key={c.number}
              href={`tel:${c.number}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:bg-secondary"
            >
              <Phone className="h-3 w-3" /> {c.label}: <span className="font-semibold">{c.number}</span>
            </a>
          ))}
        </div>
      </div>

      {share && (
        <div className="rounded-xl border border-border bg-secondary/40 p-3">
          <div className="flex items-start gap-3">
            {qr && <img src={qr} alt="Position QR" className="h-24 w-24 rounded-lg bg-white p-1" />}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Last-known-position code
              </div>
              <div className="mt-0.5 break-all font-mono text-sm font-semibold">{share.code}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {world.position[1].toFixed(5)}, {world.position[0].toFixed(5)} · {share.time} IST
              </div>
              <Button size="sm" variant="outline" className="mt-2" onClick={copy}>
                <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy share text"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
