import { useMemo } from "react";
import { Copy, LogOut, Home, Phone, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/state/store";
import { bearing, compass, encodePlusCode, fmtDistance, fmtDuration, haversine } from "@/lib/geo";
import { elevationBetween, estimateMinutes, nearestOnTrail } from "@/lib/trekpack";
import { cn } from "@/lib/utils";

/**
 * SOS card: strictly navigation and signaling. Nearest exit with bearing and
 * distance, nearest shelter, emergency numbers, and a shareable
 * last-known-position code. No first-aid or medical content by design.
 */
export function SosCard() {
  const pack = useApp((s) => s.pack);
  const distM = useApp((s) => s.distM);
  const selfSos = useApp((s) => s.selfSos);
  const setSelfSos = useApp((s) => s.setSelfSos);
  const position = useApp((s) => s.position)();

  const info = useMemo(() => {
    if (!pack) return null;
    const rank = <T extends { lat: number; lon: number }>(items: T[]) =>
      items
        .map((it) => ({
          it,
          d: haversine({ lng: position.lng, lat: position.lat }, { lng: it.lon, lat: it.lat }),
          b: bearing({ lng: position.lng, lat: position.lat }, { lng: it.lon, lat: it.lat }),
        }))
        .sort((a, b) => a.d - b.d);

    const exits = rank(pack.exits);
    const shelters = rank(pack.pois.filter((p) => p.category === "shelter"));

    const legMin = (lat: number, lon: number) => {
      const target = nearestOnTrail(pack, { lng: lon, lat });
      const trailDist = Math.abs(target.distM - distM);
      const { ascent, descent } = elevationBetween(pack, distM, target.distM);
      return Math.round(estimateMinutes(trailDist, ascent, descent));
    };

    return {
      exit: exits[0]
        ? { ...exits[0], eta: legMin(exits[0].it.lat, exits[0].it.lon) }
        : null,
      shelter: shelters[0]
        ? { ...shelters[0], eta: legMin(shelters[0].it.lat, shelters[0].it.lon) }
        : null,
      plusCode: encodePlusCode(position.lat, position.lng),
    };
  }, [pack, position, distM]);

  if (!pack || !info) return null;

  const positionText = `PagDandi SOS — last known position: ${info.plusCode} (${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}), ${Math.round(position.ele)} m, on ${pack.trek.name}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Siren className="size-4 text-red-500" />
        <div className="flex-1">
          <div className="text-sm font-semibold leading-none">SOS</div>
          <div className="text-muted-foreground mt-0.5 text-[11px]">Navigation & signaling only</div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <Button
          className={cn(
            "h-14 w-full text-base font-bold",
            selfSos
              ? "bg-red-600 hover:bg-red-700 animate-pulse"
              : "bg-red-500 hover:bg-red-600",
          )}
          onClick={() => setSelfSos(!selfSos)}
        >
          <Siren className="size-5" />
          {selfSos ? "SOS BEACON ACTIVE — tap to stand down" : "ACTIVATE SOS BEACON"}
        </Button>
        <p className="text-muted-foreground -mt-2 text-[10px] leading-relaxed">
          Your dot turns red on every PagDandi map in radio range, with bearing and distance to
          you. The nearest human is almost always faster than the nearest helicopter.
        </p>

        {info.exit && (
          <div className="rounded-lg border p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <LogOut className="size-3.5 text-green-600" />
              <span className="text-xs font-semibold">Nearest exit point</span>
            </div>
            <div className="text-sm font-medium">{info.exit.it.name}</div>
            <div className="text-muted-foreground text-xs">
              {fmtDistance(info.exit.d)} · bearing {Math.round(info.exit.b)}° ({compass(info.exit.b)}) ·
              ~{fmtDuration(info.exit.eta)} on the trail
            </div>
            <p className="text-muted-foreground mt-1 text-[11px]">{info.exit.it.note}</p>
          </div>
        )}

        {info.shelter && (
          <div className="rounded-lg border p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <Home className="size-3.5 text-amber-600" />
              <span className="text-xs font-semibold">Nearest shelter</span>
            </div>
            <div className="text-sm font-medium">{info.shelter.it.name ?? "Unnamed shelter"}</div>
            <div className="text-muted-foreground text-xs">
              {fmtDistance(info.shelter.d)} · bearing {Math.round(info.shelter.b)}° (
              {compass(info.shelter.b)}) · ~{fmtDuration(info.shelter.eta)}
            </div>
          </div>
        )}

        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Phone className="size-3.5" />
            <span className="text-xs font-semibold">Emergency numbers</span>
          </div>
          <div className="space-y-1.5">
            {pack.trek.emergency.map((e) => (
              <a
                key={e.number}
                href={`tel:${e.number}`}
                className="hover:bg-accent flex items-center justify-between rounded px-1 py-0.5 text-sm"
              >
                <span className="text-muted-foreground text-xs">{e.label}</span>
                <span className="font-mono font-semibold">{e.number}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold">Last-known-position code</span>
            <Badge variant="secondary" className="text-[9px]">
              PLUS CODE
            </Badge>
          </div>
          <div className="font-mono text-lg font-bold tracking-wide">{info.plusCode}</div>
          <div className="text-muted-foreground text-xs">
            {position.lat.toFixed(5)}, {position.lng.toFixed(5)} · {Math.round(position.ele)} m
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-7 text-xs"
            onClick={() => navigator.clipboard?.writeText(positionText)}
          >
            <Copy className="size-3" /> Copy shareable message
          </Button>
          <p className="text-muted-foreground mt-1.5 text-[10px]">
            Read this code over any radio or borrowed phone — rescue teams can decode a plus code
            without your app.
          </p>
        </div>
      </div>
    </div>
  );
}
