"use client";

import { useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import type { TrekManifest } from "@/lib/types";
import { interpolatePosition } from "@/lib/geo";

interface ElevationProfileProps {
  manifest: TrekManifest;
  kmAlongTrail: number;
  onKmChange: (km: number) => void;
  /** Compact mode renders without the Card chrome (for map overlay) */
  compact?: boolean;
}

const W = 560;
const H = 132;
const PAD_X = 34;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;

export function ElevationProfile({
  manifest,
  kmAlongTrail,
  onKmChange,
  compact = false,
}: ElevationProfileProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const { pathD, areaD, points, minEle, maxEle } = useMemo(() => {
    const wps = manifest.waypoints;
    const minEle = Math.min(...wps.map((w) => w.elevationM));
    const maxEle = Math.max(...wps.map((w) => w.elevationM));
    const eleRange = maxEle - minEle || 1;
    const plotW = W - PAD_X * 2;
    const plotH = H - PAD_TOP - PAD_BOTTOM;

    const toXY = (km: number, ele: number): [number, number] => [
      PAD_X + (km / manifest.trailLengthKm) * plotW,
      PAD_TOP + plotH - ((ele - minEle) / eleRange) * plotH,
    ];

    // Sample densely for a smooth line through interpolated segments
    const samples: [number, number][] = [];
    for (let km = 0; km <= manifest.trailLengthKm + 0.001; km += 0.15) {
      const p = interpolatePosition(manifest, km);
      samples.push(toXY(p.kmAlongTrail, p.elevationM));
    }

    const pathD = samples
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    const [lastX] = samples[samples.length - 1];
    const [firstX] = samples[0];
    const baseY = PAD_TOP + plotH;
    const areaD = `${pathD} L${lastX.toFixed(1)},${baseY} L${firstX.toFixed(1)},${baseY} Z`;

    const points = wps.map((w) => ({ ...w, xy: toXY(w.kmAlongTrail, w.elevationM) }));
    return { pathD, areaD, points, minEle, maxEle };
  }, [manifest]);

  const cursor = useMemo(() => {
    const p = interpolatePosition(manifest, kmAlongTrail);
    const plotW = W - PAD_X * 2;
    const plotH = H - PAD_TOP - PAD_BOTTOM;
    const eleRange = maxEle - minEle || 1;
    return {
      x: PAD_X + (p.kmAlongTrail / manifest.trailLengthKm) * plotW,
      y: PAD_TOP + plotH - ((p.elevationM - minEle) / eleRange) * plotH,
      elevationM: p.elevationM,
    };
  }, [manifest, kmAlongTrail, minEle, maxEle]);

  const handlePointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.buttons === 0 && e.type !== "pointerdown") return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const xRatio = (e.clientX - rect.left) / rect.width;
      const x = xRatio * W;
      const km =
        ((x - PAD_X) / (W - PAD_X * 2)) * manifest.trailLengthKm;
      onKmChange(Math.max(0, Math.min(manifest.trailLengthKm, km)));
    },
    [manifest.trailLengthKm, onKmChange],
  );

  const chart = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full cursor-crosshair touch-none select-none"
      onPointerDown={handlePointer}
      onPointerMove={handlePointer}
    >
      <path d={areaD} className="fill-foreground/8" />
      <path d={pathD} className="fill-none stroke-foreground" strokeWidth={2} />

      {points.map((w) => (
        <g key={w.id}>
          <circle cx={w.xy[0]} cy={w.xy[1]} r={3} className="fill-foreground stroke-background" strokeWidth={1.5} />
          <text
            x={w.xy[0]}
            y={H - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[8px]"
          >
            {w.distanceKm}k
          </text>
        </g>
      ))}

      <text x={PAD_X - 4} y={PAD_TOP + 6} textAnchor="end" className="fill-muted-foreground text-[8px]">
        {maxEle}m
      </text>
      <text x={PAD_X - 4} y={H - PAD_BOTTOM} textAnchor="end" className="fill-muted-foreground text-[8px]">
        {minEle}m
      </text>

      {/* Position cursor */}
      <line
        x1={cursor.x}
        y1={PAD_TOP}
        x2={cursor.x}
        y2={H - PAD_BOTTOM}
        className="stroke-foreground/40"
        strokeWidth={1.5}
        strokeDasharray="3 2"
      />
      <circle cx={cursor.x} cy={cursor.y} r={5} className="fill-foreground stroke-background" strokeWidth={2} />
      <text
        x={cursor.x}
        y={Math.max(10, cursor.y - 9)}
        textAnchor="middle"
        className="fill-foreground text-[9px] font-semibold"
      >
        {cursor.elevationM}m
      </text>
    </svg>
  );

  if (compact) return chart;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="size-4 text-muted-foreground" />
          Elevation profile
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            drag to move position
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{chart}</CardContent>
    </Card>
  );
}
