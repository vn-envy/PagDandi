/**
 * Trail Sathi harness for Gemma E4B running on-device.
 *
 * Transport: an OpenAI-compatible or Ollama-style endpoint on localhost
 * (LiteRT-LM `serve`, or `ollama serve` as fallback), proxied through the app
 * origin at /llm. The tool-calling loop is prompt-level JSON — it works with
 * native function calling where the runtime supports it and degrades to
 * constrained JSON decoding everywhere else.
 *
 * If no local model endpoint is reachable, the UI falls back to the "Pack
 * Brain": the same tools executed deterministically with templated prose,
 * clearly labeled — never presented as model output.
 */
import { runTool, TOOLS, type ToolContext } from "./tools";
import { fmtDistance, fmtDuration } from "./geo";
import { sunInfo, fmtTime } from "./sun";
import { estimateMinutes, elevationBetween, nearestOnTrail } from "./trekpack";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface SathiStep {
  kind: "tool_call" | "tool_result" | "answer";
  text: string;
}

export type SathiSource = "gemma" | "pack-brain";

export interface SathiReply {
  answer: string;
  steps: SathiStep[];
  source: SathiSource;
}

const LLM_BASE = "/llm";

/** Model actually served by the local endpoint (resolved by llmStatus). */
let activeModel: string | null = null;

const MODEL = () =>
  activeModel ?? localStorage.getItem("pagdandi.model") ?? "gemma3n:e4b";

function systemPrompt(ctx: ToolContext): string {
  const { pack } = ctx;
  const toolLines = TOOLS.map((t) => {
    const params = Object.entries(t.parameters)
      .map(([k, v]) => `${k}: ${v.type}${v.required ? " (required)" : ""} — ${v.description}`)
      .join("; ");
    return `- ${t.name}(${params || "no arguments"}): ${t.description}`;
  }).join("\n");

  return `You are Trail Sathi, the offline trekking guide inside the PagDandi app. The trekker is on the ${pack.trek.name} trek (${pack.trek.region}). You run fully on-device with no internet.

You reason over the trekker's live GPS position, the trail's elevation profile, and the time of day by calling tools. NEVER guess distances, times, or elevations — always call a tool for numbers.

TOOLS:
${toolLines}

To call a tool, reply with ONLY a JSON object on a single line, nothing else:
{"tool": "<name>", "args": {"<param>": "<value>"}}

You will receive the tool result as the next message, and may call another tool or answer. When you have what you need, answer the trekker in plain language: short, concrete, decision-oriented (2-5 sentences). Mention specific numbers from tool results. If the question involves safety margins (darkness, weather, distance), state a clear recommendation.

Trek notes: ${pack.trek.notes.join(" ")}
Never give medical advice; for injuries, point to the SOS card and the nearest exit.`;
}

interface LlmOptions {
  temperature?: number;
  json?: boolean;
}

/** Raw completion against the local endpoint. Tries Ollama's /api/chat first, then OpenAI /v1/chat/completions. */
async function complete(messages: ChatMessage[], opts: LlmOptions = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${LLM_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL(),
        messages,
        stream: false,
        ...(opts.json ? { format: "json" } : {}),
        options: { temperature: opts.temperature ?? 0.2, num_ctx: 8192 },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.message?.content ?? "";
    }
    // fall through to OpenAI-compatible shape (LiteRT-LM serve)
    const res2 = await fetch(`${LLM_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL(),
        messages,
        temperature: opts.temperature ?? 0.2,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res2.ok) throw new Error(`LLM endpoint error ${res.status}/${res2.status}`);
    const data2 = await res2.json();
    return data2.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

function parseToolCall(text: string): { name: string; args: Record<string, string> } | null {
  // accept raw JSON, fenced JSON, or JSON embedded in prose
  const candidates: string[] = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  const brace = text.match(/\{[\s\S]*\}/);
  if (brace) candidates.push(brace[0]);
  candidates.push(text);
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c.trim());
      const name = obj.tool ?? obj.name ?? obj.tool_call?.name;
      const args = obj.args ?? obj.arguments ?? obj.tool_call?.args ?? {};
      if (typeof name === "string" && TOOLS.some((t) => t.name === name)) {
        return { name, args };
      }
    } catch {
      // not JSON, keep trying
    }
  }
  return null;
}

/** The agentic loop: ask Gemma, execute tool calls locally, feed results back. */
export async function askSathi(
  question: string,
  ctx: ToolContext,
  history: ChatMessage[] = [],
  onStep?: (s: SathiStep) => void,
): Promise<SathiReply> {
  const steps: SathiStep[] = [];
  const push = (s: SathiStep) => {
    steps.push(s);
    onStep?.(s);
  };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(ctx) },
    ...history.slice(-6),
    { role: "user", content: question },
  ];

  for (let turn = 0; turn < 5; turn++) {
    const text = await complete(messages);
    const call = parseToolCall(text);
    if (!call) {
      push({ kind: "answer", text });
      return { answer: text, steps, source: "gemma" };
    }
    push({ kind: "tool_call", text: `${call.name}(${JSON.stringify(call.args)})` });
    const result = runTool(call.name, call.args, ctx);
    const resultJson = JSON.stringify(result);
    push({ kind: "tool_result", text: resultJson });
    messages.push({ role: "assistant", content: text });
    messages.push({
      role: "user",
      content: `TOOL RESULT for ${call.name}: ${resultJson}\nUse this. Call another tool (JSON only) or give your final answer now.`,
    });
  }
  const final = "I could not reach a conclusion — try rephrasing the question.";
  push({ kind: "answer", text: final });
  return { answer: final, steps, source: "gemma" };
}

/**
 * Reachability probe. Resolves the model the endpoint actually serves so the
 * UI can label answers truthfully (e.g. "gemma3n:e4b" vs a dev mock).
 */
export async function llmStatus(): Promise<{ up: boolean; model: string | null }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${LLM_BASE}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { up: false, model: null };
    const data = await res.json().catch(() => null);
    const names: string[] = data?.models?.map((m: { name: string }) => m.name) ?? [];
    const preferred = localStorage.getItem("pagdandi.model") ?? "gemma3n:e4b";
    activeModel = names.find((n) => n.startsWith(preferred)) ?? names[0] ?? preferred;
    return { up: true, model: activeModel };
  } catch {
    return { up: false, model: null };
  }
}

export async function llmAvailable(): Promise<boolean> {
  return (await llmStatus()).up;
}

// ---------------------------------------------------------------------------
// Pack Brain: deterministic, tool-driven fallback. Same tools, template prose.

export function packBrain(question: string, ctx: ToolContext): SathiReply {
  const q = question.toLowerCase();
  const steps: SathiStep[] = [];
  const call = (name: string, args: Record<string, string> = {}) => {
    steps.push({ kind: "tool_call", text: `${name}(${JSON.stringify(args)})` });
    const r = runTool(name, args, ctx);
    steps.push({ kind: "tool_result", text: JSON.stringify(r) });
    return r as Record<string, any>;
  };

  let answer: string;

  const destMatch = q.match(
    /(?:make|reach|get to|before .*? (?:at|to))\s+(?:the\s+)?([a-z' ]+?)\s+(?:before|by)\s+(dark|sunset|nightfall)/,
  );
  const wantsSunsetPlan = /sunset|dark|night|before it gets/.test(q) && /make|reach|summit|top|camp|get/.test(q);

  if (wantsSunsetPlan) {
    const place = destMatch?.[1]?.trim() || (q.includes("triund") ? "Triund Top" : "Triund Top");
    const leg = call("distance_to", { place });
    const sun = call("sunset_time");
    if (leg.error) {
      answer = `${leg.error} Ask me about a place from this Trek Pack.`;
    } else {
      const walkMin = leg.estimated_walk_minutes as number;
      const toSunset = sun.minutes_until_sunset as number;
      const toDark = sun.minutes_until_dark as number;
      const margin = toSunset - walkMin;
      const verdict =
        margin > 30
          ? `Yes — you have about ${fmtDuration(margin)} of margin. Go.`
          : margin > 0
            ? `It's tight: only ${fmtDuration(margin)} of margin. Move now and don't stop long.`
            : `No — you'd arrive ${fmtDuration(-margin)} after sunset. Camp at the nearest campsite instead and go up at first light.`;
      answer = `${leg.place} is ${leg.distance_on_trail} ${leg.ahead_or_behind}, with ${leg.ascent_m} m of climbing — about ${leg.estimated_walk_time} at a steady pace. Sunset is at ${sun.sunset} (${fmtDuration(toSunset)} away), last usable light ${sun.civil_dusk_last_light}. ${verdict}`;
      if (margin <= 0) {
        const camps = call("nearest", { category: "campsite" });
        const c = camps.results?.[0];
        if (c) answer += ` Nearest campsite: ${c.name}, ${c.distance_on_trail} ${c.ahead_or_behind}.`;
      }
      void toDark;
    }
  } else if (/water|thirst|refill|stream|spring/.test(q)) {
    const r = call("nearest", { category: "water" });
    const w = r.results?.[0];
    answer = w
      ? `Nearest water: ${w.name}, ${w.distance_on_trail} ${w.ahead_or_behind} (${w.direction}), about ${w.estimated_walk_time}. Fill up — sources are sparse higher on this trail.`
      : "No mapped water source in this Trek Pack near you.";
  } else if (/camp|tent|sleep|stay|night halt/.test(q)) {
    const r = call("nearest", { category: "campsite" });
    const c = r.results?.[0];
    answer = c
      ? `Nearest campsite: ${c.name}, ${c.distance_on_trail} ${c.ahead_or_behind}, ~${c.estimated_walk_time}. Elevation ${c.elevation_m ?? "?"} m.`
      : "No mapped campsite nearby.";
  } else if (/shelter|cave|hut|rain|storm/.test(q)) {
    const r = call("nearest", { category: "shelter" });
    const s0 = r.results?.[0];
    answer = s0
      ? `Nearest shelter: ${s0.name}, ${s0.distance_on_trail} ${s0.ahead_or_behind} (${s0.direction}), about ${s0.estimated_walk_time}. If weather is closing in, move now — visibility drops fast on this ridge.`
      : "No mapped shelter nearby.";
  } else if (/exit|escape|get down|descend|way out|give up|turn back/.test(q)) {
    const r = call("nearest", { category: "exit" });
    const e = r.results?.[0];
    answer = e
      ? `Nearest exit: ${e.name}, ${e.distance_on_trail} away (${e.direction}), about ${e.estimated_walk_time}. ${e.note ?? ""}`
      : "No exit point found.";
  } else if (/climb|ascent|elevation|how high|gain/.test(q)) {
    const r = call("remaining_ascent");
    answer = `You're at ${r.current_elevation_m} m. ${r.ascent_m} m of climbing remains to ${r.to} (max ${r.max_elevation_m} m).`;
  } else if (/sunset|sunrise|light|time/.test(q)) {
    const s = call("sunset_time");
    answer = `It's ${s.local_time_now}. Sunset at ${s.sunset}, last usable light ${s.civil_dusk_last_light} — ${fmtDuration(s.minutes_until_sunset as number)} of daylight left. ${s.note}`;
  } else if (/where am i|status|position|far|progress/.test(q)) {
    const st = call("current_status");
    answer = `You're at ${st.elevation_m} m on ${st.trek}, ${st.walked_from_trailhead} from the trailhead with ${st.remaining_to_trail_end} to the trail end. Local time ${st.local_time}.`;
  } else {
    const st = call("current_status");
    answer = `I can answer questions about distances, water, campsites, shelters, exits, climbing and daylight on this trek. Right now you're at ${st.elevation_m} m, ${st.walked_from_trailhead} in, and it's ${st.local_time}.`;
  }

  return { answer, steps, source: "pack-brain" };
}

// ---------------------------------------------------------------------------
// Humsafar: situational brief when a peer SOS beacon appears.

export interface RescueBriefInput {
  peerName: string;
  peerLat: number;
  peerLng: number;
  ctx: ToolContext;
}

export async function rescueBrief(input: RescueBriefInput, useModel: boolean): Promise<SathiReply> {
  const { peerName, peerLat, peerLng, ctx } = input;
  const me = ctx.position;
  const dist = Math.abs(
    nearestOnTrail(ctx.pack, { lng: peerLng, lat: peerLat }).distM - me.distM,
  );
  const { ascent, descent } = elevationBetween(
    ctx.pack,
    me.distM,
    nearestOnTrail(ctx.pack, { lng: peerLng, lat: peerLat }).distM,
  );
  const etaMin = Math.round(estimateMinutes(dist, ascent, descent));
  const sun = sunInfo(me.lat, me.lng, ctx.now);
  const water = runTool("nearest", { category: "water" }, ctx) as Record<string, any>;
  const facts = {
    peer: peerName,
    distance: fmtDistance(dist),
    ascent_m: ascent,
    descent_m: descent,
    eta: fmtDuration(etaMin),
    sunset: fmtTime(sun.sunset),
    minutes_of_light: sun.minutesToSunset,
    nearest_water: water.results?.[0]?.name ?? "unknown",
  };

  const fallback: SathiReply = {
    answer:
      `SOS from ${peerName}: ${facts.distance} away along the trail (${ascent} m up / ${descent} m down). ` +
      `At your pace: ~${facts.eta}. Sunset ${facts.sunset} — ${facts.minutes_of_light > etaMin ? "you have light margin" : "you will lose light, take your headlamp"}. ` +
      `Carry water; last source near you is ${facts.nearest_water}. The nearest human is almost always faster than the nearest helicopter.`,
    steps: [{ kind: "tool_result", text: JSON.stringify(facts) }],
    source: "pack-brain",
  };

  if (!useModel) return fallback;
  try {
    const text = await complete(
      [
        {
          role: "system",
          content:
            "You are Trail Sathi. A fellow trekker triggered an SOS beacon. Compose a 3-sentence situational brief for the responder using ONLY these verified facts. Imperative, calm, concrete. No medical advice.",
        },
        { role: "user", content: JSON.stringify(facts) },
      ],
      { temperature: 0.3 },
    );
    return { answer: text, steps: fallback.steps, source: "gemma" };
  } catch {
    return fallback;
  }
}
