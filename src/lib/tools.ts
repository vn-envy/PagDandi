/**
 * Trail Sathi's local tools. Gemma calls these by name; every one of them
 * computes over the Trek Pack + simulated GPS + clock — a live world model,
 * no retrieval, no network.
 */
import { bearing, compass, fmtDistance, fmtDuration, haversine } from "./geo";
import { sunInfo, fmtTime } from "./sun";
import {
  elevationBetween,
  estimateMinutes,
  nearestOnTrail,
  remainingAscent,
  type Poi,
  type TrekPack,
  type TrailPosition,
} from "./trekpack";

export interface ToolContext {
  pack: TrekPack;
  position: TrailPosition;
  now: Date;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  run: (args: Record<string, string>, ctx: ToolContext) => Record<string, unknown>;
}

function findPoi(pack: TrekPack, query: string): Poi | null {
  const q = query.toLowerCase().trim();
  const named = pack.pois.filter((p) => p.name);
  // exact > startsWith > includes > token overlap
  const scored = named
    .map((p) => {
      const n = p.name!.toLowerCase();
      let score = 0;
      if (n === q) score = 100;
      else if (n.startsWith(q) || q.startsWith(n)) score = 80;
      else if (n.includes(q) || q.includes(n)) score = 60;
      else {
        const qTokens = q.split(/\s+/);
        const hits = qTokens.filter((t) => t.length > 2 && n.includes(t)).length;
        score = hits > 0 ? 30 + hits * 10 : 0;
      }
      return { p, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.p ?? null;
}

function describeLeg(ctx: ToolContext, target: { lat: number; lon: number; name?: string | null }) {
  const { pack, position } = ctx;
  const targetPos = nearestOnTrail(pack, { lng: target.lon, lat: target.lat });
  const offTrail = haversine({ lng: target.lon, lat: target.lat }, targetPos);
  const alongTrail = Math.abs(targetPos.distM - position.distM);
  const straight = haversine({ lng: position.lng, lat: position.lat }, { lng: target.lon, lat: target.lat });
  const { ascent, descent } = elevationBetween(pack, position.distM, targetPos.distM);
  const walkMin = estimateMinutes(alongTrail + offTrail, ascent, descent);
  const brg = bearing({ lng: position.lng, lat: position.lat }, { lng: target.lon, lat: target.lat });
  return {
    distance_on_trail: fmtDistance(alongTrail + offTrail),
    distance_straight_line: fmtDistance(straight),
    direction: `${compass(brg)} (${Math.round(brg)}°)`,
    ascent_m: ascent,
    descent_m: descent,
    estimated_walk_time: fmtDuration(walkMin),
    estimated_walk_minutes: Math.round(walkMin),
    ahead_or_behind: targetPos.distM >= position.distM ? "ahead of you on the trail" : "behind you (back toward the trailhead)",
  };
}

export const TOOLS: ToolSpec[] = [
  {
    name: "current_status",
    description:
      "Your GPS position, elevation, distance walked from the trailhead, distance remaining to the end, and current time.",
    parameters: {},
    run: (_args, ctx) => {
      const { pack, position, now } = ctx;
      return {
        trek: pack.trek.name,
        lat: +position.lat.toFixed(5),
        lon: +position.lng.toFixed(5),
        elevation_m: Math.round(position.ele),
        walked_from_trailhead: fmtDistance(position.distM),
        remaining_to_trail_end: fmtDistance(pack.stats.lengthM - position.distM),
        local_time: fmtTime(now),
      };
    },
  },
  {
    name: "distance_to",
    description:
      "Distance, direction, ascent/descent and estimated walking time from your current position to a named place on this trek (e.g. 'Triund Top', 'Snowline Cafe', 'Lahesh Cave', 'Indrahar Pass').",
    parameters: {
      place: { type: "string", description: "name of the place", required: true },
    },
    run: (args, ctx) => {
      const poi = findPoi(ctx.pack, args.place ?? "");
      if (!poi) return { error: `No place matching "${args.place}" in this Trek Pack.` };
      return { place: poi.name, elevation_m: poi.ele, ...describeLeg(ctx, poi) };
    },
  },
  {
    name: "remaining_ascent",
    description:
      "Total climbing (uphill meters) left from your current position, either to the end of the trail or to a named place.",
    parameters: {
      place: { type: "string", description: "optional destination; defaults to trail end" },
    },
    run: (args, ctx) => {
      const { pack, position } = ctx;
      if (args.place) {
        const poi = findPoi(pack, args.place);
        if (!poi) return { error: `No place matching "${args.place}".` };
        const target = nearestOnTrail(pack, { lng: poi.lon, lat: poi.lat });
        const { ascent, descent } = elevationBetween(pack, position.distM, target.distM);
        return { to: poi.name, ascent_m: ascent, descent_m: descent };
      }
      return {
        to: "end of trail (Indrahar Pass)",
        ascent_m: remainingAscent(pack, position.distM),
        current_elevation_m: Math.round(position.ele),
        max_elevation_m: pack.stats.maxEle,
      };
    },
  },
  {
    name: "sunset_time",
    description:
      "Sunset and last-usable-light (civil dusk) times at your position today, and how many minutes of daylight remain.",
    parameters: {},
    run: (_args, ctx) => {
      const s = sunInfo(ctx.position.lat, ctx.position.lng, ctx.now);
      return {
        local_time_now: fmtTime(ctx.now),
        sunset: fmtTime(s.sunset),
        civil_dusk_last_light: fmtTime(s.dusk),
        minutes_until_sunset: s.minutesToSunset,
        minutes_until_dark: s.minutesToDusk,
        note: "In the Dhauladhars light fades faster below ridgelines; plan to be at camp by sunset.",
      };
    },
  },
  {
    name: "nearest",
    description:
      "Nearest points of a category from your position. Categories: water, shelter, campsite, viewpoint, cafe, exit.",
    parameters: {
      category: {
        type: "string",
        description: "one of: water, shelter, campsite, viewpoint, cafe, exit",
        required: true,
      },
    },
    run: (args, ctx) => {
      const cat = (args.category ?? "").toLowerCase().trim();
      const { pack, position } = ctx;
      const pool: { name: string | null; lat: number; lon: number; ele: number | null; note?: string }[] =
        cat === "exit"
          ? pack.exits.map((e) => ({ ...e, note: e.note }))
          : pack.pois.filter((p) => p.category === cat);
      if (!pool.length) return { error: `Unknown or empty category "${cat}".` };
      const ranked = pool
        .map((p) => ({
          p,
          d: haversine({ lng: position.lng, lat: position.lat }, { lng: p.lon, lat: p.lat }),
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      return {
        category: cat,
        results: ranked.map(({ p }) => ({
          name: p.name ?? `(unnamed ${cat})`,
          elevation_m: p.ele,
          ...(p.note ? { note: p.note } : {}),
          ...describeLeg(ctx, p),
        })),
      };
    },
  },
];

export function runTool(name: string, args: Record<string, string>, ctx: ToolContext) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool "${name}". Available: ${TOOLS.map((t) => t.name).join(", ")}` };
  try {
    return tool.run(args ?? {}, ctx);
  } catch (e) {
    return { error: String(e) };
  }
}
