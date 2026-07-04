import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Satellite } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/state/store";
import { fmtDistance } from "@/lib/geo";
import { sunInfo, fmtTime } from "@/lib/sun";

/** SVG elevation profile with the current position marker. */
function ElevationProfile() {
  const pack = useApp((s) => s.pack);
  const distM = useApp((s) => s.distM);
  const setDistM = useApp((s) => s.setDistM);
  const svgRef = useRef<SVGSVGElement>(null);

  const path = useMemo(() => {
    if (!pack) return { line: "", area: "" };
    const W = 600;
    const H = 80;
    const { minEle, maxEle, lengthM } = pack.stats;
    const pts = pack.trail.map((v) => {
      const x = (v[3] / lengthM) * W;
      const y = H - ((v[2] - minEle) / (maxEle - minEle)) * (H - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return {
      line: `M${pts.join(" L")}`,
      area: `M0,${H} L${pts.join(" L")} L${600},${H} Z`,
    };
  }, [pack]);

  if (!pack) return null;
  const { minEle, maxEle, lengthM } = pack.stats;
  const x = (distM / lengthM) * 600;
  const pos = useApp.getState().position();
  const y = 80 - ((pos.ele - minEle) / (maxEle - minEle)) * 72 - 4;

  const seek = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setDistM(Math.round(frac * lengthM));
  };

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 600 80"
      preserveAspectRatio="none"
      className="h-16 w-full cursor-crosshair touch-none select-none"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        seek(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && seek(e.clientX)}
    >
      <path d={path.area} className="fill-primary/10" />
      <path d={path.line} className="stroke-primary fill-none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <line x1={x} y1="0" x2={x} y2="80" className="stroke-blue-500" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <circle cx={x} cy={y} r="3.5" className="fill-blue-500 stroke-white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Demo GPS rig: on a real trek this panel is replaced by the phone's GPS
 * (navigator.geolocation snapped to the trail). The slider exists so the whole
 * experience can be demonstrated far from the mountain — and it is labeled as
 * such on screen.
 */
export function PositionPanel() {
  const pack = useApp((s) => s.pack);
  const distM = useApp((s) => s.distM);
  const setDistM = useApp((s) => s.setDistM);
  const playing = useApp((s) => s.playing);
  const setPlaying = useApp((s) => s.setPlaying);
  const clockOffsetMin = useApp((s) => s.clockOffsetMin);
  const setClockOffsetMin = useApp((s) => s.setClockOffsetMin);
  const now = useApp((s) => s.now)();
  const [showClock, setShowClock] = useState(false);

  // walk animation
  useEffect(() => {
    if (!playing || !pack) return;
    const timer = setInterval(() => {
      const s = useApp.getState();
      const next = s.distM + 25;
      if (next >= pack.stats.lengthM) {
        s.setDistM(pack.stats.lengthM);
        s.setPlaying(false);
      } else {
        s.setDistM(next);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [playing, pack]);

  if (!pack) return null;
  const pos = useApp.getState().position();
  const sun = sunInfo(pos.lat, pos.lng, now);

  return (
    <div className="bg-background/85 pointer-events-auto rounded-xl border p-3 shadow-lg backdrop-blur-md">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Satellite className="text-muted-foreground size-3.5" />
          <span className="text-xs font-semibold">Demo GPS</span>
          <Badge variant="outline" className="text-[9px]">
            SIMULATED POSITION
          </Badge>
        </div>
        <div className="text-muted-foreground text-[11px] tabular-nums">
          {fmtDistance(distM)} / {fmtDistance(pack.stats.lengthM)} · {Math.round(pos.ele)} m
        </div>
      </div>

      <ElevationProfile />

      <div className="mt-2 flex items-center gap-2">
        <Button
          size="icon"
          variant="secondary"
          className="size-7 shrink-0"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? "Pause walk" : "Play walk"}
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </Button>
        <Slider
          value={[distM]}
          min={0}
          max={pack.stats.lengthM}
          step={20}
          onValueChange={([v]) => setDistM(v)}
          className="flex-1"
        />
        <button
          className="text-muted-foreground shrink-0 text-[11px] tabular-nums underline decoration-dotted underline-offset-2"
          onClick={() => setShowClock(!showClock)}
          title="Simulate time of day"
        >
          {fmtTime(now)}
        </button>
      </div>

      {showClock && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-muted-foreground shrink-0 text-[10px]">Clock +{Math.round(clockOffsetMin / 60)}h</span>
          <Slider
            value={[clockOffsetMin]}
            min={0}
            max={24 * 60}
            step={15}
            onValueChange={([v]) => setClockOffsetMin(v)}
            className="flex-1"
          />
          <span className="text-muted-foreground shrink-0 text-[10px]">
            sunset {fmtTime(sun.sunset)}
          </span>
        </div>
      )}
    </div>
  );
}
