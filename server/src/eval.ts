/**
 * Trail Sathi eval harness.
 *
 *   npm run eval            # offline: deterministic tool + retrieval checks
 *   npm run eval -- --live  # also hit the running Gemma backend end-to-end
 *
 * Two things are measured:
 *   1. Tool routing — does each question trigger the expected tool(s)?
 *   2. Retrieval — does an almanac-shaped question pull the right section?
 *
 * The offline pass runs the same executeTool / retrieveAlmanac code the server
 * uses, so it's a real regression gate even with no model pulled.
 */

import {
  executeTool,
  interpolatePosition,
  loadPois,
  type Position,
} from "./trek-tools.js";
import { retrieveAlmanac } from "./rag.js";
import { trailSathiGuide } from "./gemma.js";

interface Case {
  q: string;
  km: number;
  expectTools: string[]; // tools that SHOULD be exercisable for this question
  expectAlmanac?: string; // substring expected in a retrieved almanac title
  mustSay?: RegExp; // live-mode: answer must contain this
}

const POI = loadPois();
const water = POI.find((p) => p.type === "water")!;
const camp = POI.find((p) => p.type === "campsite")!;

const CASES: Case[] = [
  {
    q: "Can I make Triund top before sunset?",
    km: 5.1,
    expectTools: ["remaining_ascent", "sunset_time"],
    mustSay: /sunset|dark|time|min|hour/i,
  },
  {
    q: "How long to the Snowline camp at a relaxed pace?",
    km: 5.1,
    expectTools: ["route_eta"],
  },
  {
    q: "Is there water at the Magic View spring right now?",
    km: 5.1,
    expectTools: ["water_status"],
    expectAlmanac: "Water",
  },
  {
    q: "There's loose scree on the path here, careful.",
    km: 6.8,
    expectTools: ["mark_hazard"],
  },
  {
    q: "What's the weather looking like for the next few hours?",
    km: 7.4,
    expectTools: ["conditions_outlook"],
    expectAlmanac: "Weather",
  },
  {
    q: "Where's the nearest exit if I need to bail?",
    km: 5.1,
    expectTools: ["nearest"],
  },
  {
    q: "Are there bears on this trail?",
    km: 2.8,
    expectTools: [],
    expectAlmanac: "Fauna",
  },
  {
    q: "Can I camp at the top overnight?",
    km: 8.2,
    expectTools: [],
    expectAlmanac: "Camping",
  },
];

/** Sanity-check that each expected tool runs and returns a value for the position. */
function toolsExecute(tools: string[], position: Position): boolean {
  const argsFor: Record<string, Record<string, unknown>> = {
    remaining_ascent: {},
    sunset_time: {},
    conditions_outlook: { hours_ahead: 3 },
    route_eta: { to_poi_id: camp.id, pace: "relaxed" },
    water_status: { poi_id: water.id },
    mark_hazard: { type: "scree", note: "eval" },
    nearest: { type: "exit" },
  };
  return tools.every((t) => {
    try {
      const r = executeTool(t, argsFor[t] ?? {}, position);
      return r !== undefined && r !== null;
    } catch {
      return false;
    }
  });
}

async function run() {
  const live = process.argv.includes("--live");
  let pass = 0;
  let fail = 0;
  const rows: string[] = [];

  console.log(`\nTrail Sathi eval — ${CASES.length} cases (${live ? "live + offline" : "offline"})\n`);

  for (const c of CASES) {
    const position = interpolatePosition(c.km);
    const checks: string[] = [];
    let ok = true;

    // 1. Expected tools execute cleanly
    if (c.expectTools.length) {
      const t = toolsExecute(c.expectTools, position);
      ok &&= t;
      checks.push(`${t ? "✓" : "✗"} tools[${c.expectTools.join(",")}]`);
    }

    // 2. Retrieval lands on the right section
    if (c.expectAlmanac) {
      const r = await retrieveAlmanac(c.q);
      const hit = !!r?.chunks.some((ch) =>
        ch.title.toLowerCase().includes(c.expectAlmanac!.toLowerCase()),
      );
      ok &&= hit;
      checks.push(`${hit ? "✓" : "✗"} almanac~"${c.expectAlmanac}"${r ? ` (${r.method})` : ""}`);
    }

    // 3. Live end-to-end
    if (live) {
      try {
        const res = await trailSathiGuide(c.q, c.km);
        const calledNames = res.toolCalls.map((tc) => tc.name);
        const covered =
          c.expectTools.length === 0 ||
          c.expectTools.some((t) => calledNames.includes(t));
        const said = !c.mustSay || c.mustSay.test(res.reply);
        ok &&= covered && said;
        checks.push(
          `${covered ? "✓" : "✗"} called[${calledNames.join(",") || "none"}] via ${res.backend}`,
        );
        if (c.mustSay) checks.push(`${said ? "✓" : "✗"} answer matches /${c.mustSay.source}/`);
      } catch (e) {
        ok = false;
        checks.push(`✗ live error: ${String(e).slice(0, 60)}`);
      }
    }

    if (ok) pass++;
    else fail++;
    rows.push(`${ok ? "PASS" : "FAIL"}  ${c.q}\n        ${checks.join("  ·  ")}`);
  }

  console.log(rows.join("\n"));
  const pct = Math.round((pass / CASES.length) * 100);
  console.log(`\n${pass}/${CASES.length} passed (${pct}%)  ${fail ? `— ${fail} failing` : "— all green"}\n`);
  process.exit(fail ? 1 : 0);
}

run();
