import SunCalc from "suncalc";
import {
  bearing,
  compass,
  estimateTime,
  fmtDistance,
  fmtDuration,
  haversine,
  pointAtDistance,
  remainingAscent,
  trailLength,
  type LngLat,
  type TrailPoint,
} from "./geo";
import type { Poi, PoiCategory, TrekPackManifest } from "./trekpack";

/**
 * The live "world model" the guide reasons over. Position and time are mutable
 * (driven by the GPS simulator / real GPS), everything else comes from the
 * offline Trek Pack. Tools are pure functions of this state — no network.
 */
export interface WorldState {
  manifest: TrekPackManifest;
  trail: TrailPoint[];
  /** Current progress along the trail, in metres from the start. */
  distanceAlong: number;
  position: LngLat;
  elevation: number;
  now: Date;
  paceKmh: number;
}

export interface ToolResult {
  ok: boolean;
  /** Structured data for the UI / model. */
  data: Record<string, unknown>;
  /** One-line natural-language summary the model can quote directly. */
  summary: string;
}

function findPoi(manifest: TrekPackManifest, query: string): Poi | undefined {
  const q = query.trim().toLowerCase();
  return (
    manifest.pois.find((p) => p.id.toLowerCase() === q) ||
    manifest.pois.find((p) => p.name.toLowerCase() === q) ||
    manifest.pois.find((p) => p.name.toLowerCase().includes(q)) ||
    manifest.pois.find((p) => p.category === q)
  );
}

/** distance_to(poi) — straight-line distance + bearing to a named POI. */
export function distance_to(state: WorldState, poi: string): ToolResult {
  const target = findPoi(state.manifest, poi);
  if (!target)
    return { ok: false, data: { poi }, summary: `No POI matching "${poi}".` };
  const d = haversine(state.position, target.coord);
  const brg = bearing(state.position, target.coord);
  const ascent = target.ele
    ? Math.max(0, target.ele - state.elevation)
    : undefined;
  const eta = estimateTime(d, ascent ?? 0, state.paceKmh);
  return {
    ok: true,
    data: {
      name: target.name,
      distance_m: Math.round(d),
      bearing_deg: Math.round(brg),
      compass: compass(brg),
      ascent_m: ascent != null ? Math.round(ascent) : null,
      eta_seconds: Math.round(eta),
    },
    summary: `${target.name}: ${fmtDistance(d)} away, bearing ${Math.round(
      brg
    )}\u00b0 (${compass(brg)})${
      ascent ? `, +${Math.round(ascent)} m up` : ""
    }, ~${fmtDuration(eta)} at your pace.`,
  };
}

/** remaining_ascent() — total climb left to the end (or to a target POI). */
export function remaining_ascent(
  state: WorldState,
  toPoi?: string
): ToolResult {
  if (toPoi) {
    const target = findPoi(state.manifest, toPoi);
    if (target?.ele != null) {
      const gain = Math.max(0, target.ele - state.elevation);
      return {
        ok: true,
        data: { to: target.name, ascent_m: Math.round(gain) },
        summary: `About ${Math.round(gain)} m of ascent to ${target.name}.`,
      };
    }
  }
  const gain = remainingAscent(state.trail, state.distanceAlong);
  const endEle = state.trail[state.trail.length - 1]?.ele ?? state.elevation;
  return {
    ok: true,
    data: {
      ascent_m: Math.round(gain),
      end_elevation_m: Math.round(endEle),
      current_elevation_m: Math.round(state.elevation),
    },
    summary: `~${Math.round(gain)} m of climbing remains to the trail end (${Math.round(
      endEle
    )} m).`,
  };
}

/** sunset_time() — real astronomical sunset for the trek + time remaining. */
export function sunset_time(state: WorldState): ToolResult {
  const [lng, lat] = state.manifest.center;
  const times = SunCalc.getTimes(state.now, lat, lng);
  const sunset = times.sunset;
  const dusk = times.dusk; // end of civil twilight — real "dark"
  const msToSunset = sunset.getTime() - state.now.getTime();
  const msToDark = dusk.getTime() - state.now.getTime();
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
  return {
    ok: true,
    data: {
      sunset: fmt(sunset),
      dark: fmt(dusk),
      seconds_to_sunset: Math.round(msToSunset / 1000),
      seconds_to_dark: Math.round(msToDark / 1000),
    },
    summary:
      msToSunset > 0
        ? `Sunset ${fmt(sunset)} (in ${fmtDuration(
            msToSunset / 1000
          )}); full dark by ${fmt(dusk)}.`
        : `The sun has already set (${fmt(sunset)}). Dark now.`,
  };
}

/** nearest(category) — closest POI of a kind (water/shelter/exit/campsite). */
export function nearest(state: WorldState, category: string): ToolResult {
  const cat = category.trim().toLowerCase() as PoiCategory;
  const matches = state.manifest.pois.filter((p) => p.category === cat);
  if (matches.length === 0)
    return {
      ok: false,
      data: { category },
      summary: `No "${category}" points in this Trek Pack.`,
    };
  let best = matches[0];
  let bestD = Infinity;
  for (const p of matches) {
    const d = haversine(state.position, p.coord);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  const brg = bearing(state.position, best.coord);
  return {
    ok: true,
    data: {
      name: best.name,
      category: cat,
      distance_m: Math.round(bestD),
      bearing_deg: Math.round(brg),
      compass: compass(brg),
      note: best.note ?? null,
    },
    summary: `Nearest ${cat}: ${best.name}, ${fmtDistance(bestD)} ${compass(
      brg
    )}.${best.note ? ` ${best.note}` : ""}`,
  };
}

/**
 * summit_feasibility() — the flagship reasoning tool. Combines remaining
 * distance/ascent, pace and real sunset to answer "make it before dark?".
 */
export function summit_feasibility(
  state: WorldState,
  toPoi?: string
): ToolResult {
  const target = toPoi ? findPoi(state.manifest, toPoi) : undefined;
  const targetDist = target
    ? trailLength(state.trail) // approximate: treat named target as trail end if summit
    : trailLength(state.trail);
  // If a target POI is given, snap to its trail distance by nearest trail node.
  let goalDist = targetDist;
  if (target) {
    let bestGap = Infinity;
    for (const tp of state.trail) {
      const g = haversine(tp.coord, target.coord);
      if (g < bestGap) {
        bestGap = g;
        goalDist = tp.dist;
      }
    }
  }
  const remainingDist = Math.max(0, goalDist - state.distanceAlong);
  const goalPoint = pointAtDistance(state.trail, goalDist);
  const ascent = Math.max(0, remainingAscent(state.trail, state.distanceAlong));
  const eta = estimateTime(remainingDist, ascent, state.paceKmh);
  const sun = sunset_time(state);
  const secToDark = sun.data.seconds_to_dark as number;
  const margin = secToDark - eta;
  const verdict =
    margin > 45 * 60 ? "yes" : margin > 0 ? "tight" : "no";
  const targetName = target?.name ?? "the trail end";
  let summary: string;
  if (verdict === "yes")
    summary = `Yes \u2014 ${targetName} is ~${fmtDuration(
      eta
    )} away and you have ${fmtDuration(secToDark)} of light. Comfortable margin.`;
  else if (verdict === "tight")
    summary = `Tight \u2014 ${targetName} is ~${fmtDuration(
      eta
    )} away, only ${fmtDuration(
      secToDark
    )} of light left. Move now and don't linger.`;
  else
    summary = `No \u2014 ${targetName} is ~${fmtDuration(
      eta
    )} away but only ${fmtDuration(
      Math.max(0, secToDark)
    )} of light remains. Camp instead of pushing on.`;

  return {
    ok: true,
    data: {
      target: targetName,
      remaining_distance_m: Math.round(remainingDist),
      remaining_ascent_m: Math.round(ascent),
      eta_seconds: Math.round(eta),
      seconds_of_light: Math.round(secToDark),
      margin_seconds: Math.round(margin),
      verdict,
      goal_coord: goalPoint.coord,
    },
    summary,
  };
}

/** Dispatch a tool call by name. Central point used by the Gemma loop. */
export function runTool(
  state: WorldState,
  name: string,
  args: Record<string, unknown>
): ToolResult {
  switch (name) {
    case "distance_to":
      return distance_to(state, String(args.poi ?? args.name ?? ""));
    case "remaining_ascent":
      return remaining_ascent(
        state,
        args.to_poi ? String(args.to_poi) : undefined
      );
    case "sunset_time":
      return sunset_time(state);
    case "nearest":
      return nearest(state, String(args.category ?? args.type ?? "water"));
    case "summit_feasibility":
      return summit_feasibility(
        state,
        args.target ? String(args.target) : undefined
      );
    default:
      return {
        ok: false,
        data: { name },
        summary: `Unknown tool "${name}".`,
      };
  }
}

/** JSON-schema tool declarations passed to Gemma for native function calling. */
export const TOOL_DECLARATIONS = [
  {
    name: "distance_to",
    description:
      "Straight-line distance, bearing and rough time from the trekker's current GPS position to a named point of interest (POI) on the trail.",
    parameters: {
      type: "object",
      properties: {
        poi: {
          type: "string",
          description:
            "POI name or category, e.g. 'Triund Top', 'Snowline Stream', 'water', 'shelter'.",
        },
      },
      required: ["poi"],
    },
  },
  {
    name: "remaining_ascent",
    description:
      "Total remaining uphill climb (metres of positive elevation gain) from the current position to the trail end, or to an optional target POI.",
    parameters: {
      type: "object",
      properties: {
        to_poi: {
          type: "string",
          description: "Optional target POI name to measure ascent to.",
        },
      },
    },
  },
  {
    name: "sunset_time",
    description:
      "Today's real astronomical sunset and end-of-twilight (dark) times for this trek, plus how long until each from the current clock.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "nearest",
    description:
      "The nearest POI of a given category to the current position, with distance and bearing.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["water", "shelter", "exit", "campsite", "viewpoint", "food"],
          description: "Kind of POI to find.",
        },
      },
      required: ["category"],
    },
  },
  {
    name: "summit_feasibility",
    description:
      "Decide whether the trekker can reach a target (default: trail end / summit) before dark, using remaining distance, ascent, pace and real sunset. Returns a verdict: yes | tight | no.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description:
            "Optional target POI, e.g. 'Triund Top' or 'Indrahar Pass'. Defaults to the trail end.",
        },
      },
    },
  },
] as const;
