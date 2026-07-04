import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildTrail,
  pointAtFraction,
  trailLength,
  type TrailPoint,
} from "@/lib/geo";
import { loadTrekPack, type TrekPackManifest } from "@/lib/trekpack";
import type { WorldState } from "@/lib/tools";

interface UseWorld {
  manifest: TrekPackManifest | null;
  trail: TrailPoint[];
  world: WorldState | null;
  /** Progress along trail, 0..1. */
  fraction: number;
  setFraction: (f: number) => void;
  /** Minutes added to the pack's demo clock via the time slider. */
  clockOffsetMin: number;
  setClockOffsetMin: (m: number) => void;
  paceKmh: number;
  setPaceKmh: (p: number) => void;
  now: Date;
}

export function useWorld(packUrl: string): UseWorld {
  const [manifest, setManifest] = useState<TrekPackManifest | null>(null);
  const [fraction, setFraction] = useState(0.55);
  const [clockOffsetMin, setClockOffsetMin] = useState(0);
  const [paceKmh, setPaceKmh] = useState(3.0);

  useEffect(() => {
    let live = true;
    loadTrekPack(packUrl)
      .then((m) => live && setManifest(m))
      .catch((e) => console.error("Trek Pack load failed", e));
    return () => {
      live = false;
    };
  }, [packUrl]);

  const trail = useMemo<TrailPoint[]>(
    () => (manifest ? buildTrail(manifest.trail, manifest.elevation) : []),
    [manifest]
  );

  const baseDate = useMemo(() => {
    if (manifest?.demoDate) return new Date(manifest.demoDate);
    return new Date();
  }, [manifest]);

  const now = useMemo(
    () => new Date(baseDate.getTime() + clockOffsetMin * 60_000),
    [baseDate, clockOffsetMin]
  );

  const world = useMemo<WorldState | null>(() => {
    if (!manifest || trail.length === 0) return null;
    const p = pointAtFraction(trail, fraction);
    return {
      manifest,
      trail,
      distanceAlong: fraction * trailLength(trail),
      position: p.coord,
      elevation: p.ele,
      now,
      paceKmh,
    };
  }, [manifest, trail, fraction, now, paceKmh]);

  const clamp = useCallback((f: number) => setFraction(Math.max(0, Math.min(1, f))), []);

  return {
    manifest,
    trail,
    world,
    fraction,
    setFraction: clamp,
    clockOffsetMin,
    setClockOffsetMin,
    paceKmh,
    setPaceKmh,
    now,
  };
}
