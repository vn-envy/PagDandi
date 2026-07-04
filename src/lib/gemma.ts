import {
  runTool,
  summit_feasibility,
  sunset_time,
  nearest,
  distance_to,
  TOOL_DECLARATIONS,
  type WorldState,
  type ToolResult,
} from "./tools";
import { fmtDistance } from "./geo";

/**
 * Gemma E4B integration.
 *
 * Trail Sathi is NOT a RAG chatbot. It uses Gemma's native function calling to
 * hit local tools (distance_to, remaining_ascent, sunset_time, nearest,
 * summit_feasibility) and reasons over the live GPS position, elevation profile
 * and time of day. Everything runs on a LOCAL endpoint — LiteRT-LM `serve`
 * (preferred) or Ollama as a fallback — both of which expose an
 * OpenAI-compatible /v1/chat/completions API with tool calling.
 *
 * When no local model endpoint is reachable (e.g. a laptop with the runtime not
 * yet started), we degrade to an on-device deterministic planner that calls the
 * SAME real tools. The tools are always real; only the natural-language
 * orchestration is rule-based in that mode. This preserves demo integrity — we
 * never fabricate distances, ascents or sunset times.
 */

export interface GemmaConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
}

const STORE_KEY = "pagdandi.gemma.config";

export const DEFAULT_CONFIG: GemmaConfig = {
  // LiteRT-LM serve / Ollama both default to localhost. Override in Settings.
  endpoint: "http://localhost:11434/v1",
  model: "gemma3n:e4b",
};

export function getConfig(): GemmaConfig {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_CONFIG;
}

export function setConfig(cfg: Partial<GemmaConfig>) {
  const next = { ...getConfig(), ...cfg };
  localStorage.setItem(STORE_KEY, JSON.stringify(next));
  return next;
}

export interface AgentStep {
  tool: string;
  args: Record<string, unknown>;
  result: ToolResult;
}

export interface AgentAnswer {
  text: string;
  steps: AgentStep[];
  /** true if a live Gemma endpoint produced the answer; false = local fallback. */
  online: boolean;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

function fmt(d: Date) {
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

/** A compact Trek Pack manifest for the system prompt (fits Gemma's window). */
export function buildSystemPrompt(state: WorldState): string {
  const m = state.manifest;
  const poiLines = m.pois
    .map((p) => `  - ${p.name} [${p.category}] ${p.ele ?? "?"} m`)
    .join("\n");
  return [
    "You are Trail Sathi, an offline mountain guide inside the PagDandi app.",
    "You reason about a trekker's real situation using TOOLS — never guess distances, ascents or times; always call a tool.",
    "Be concise, calm and decisive, like an experienced guide. 1-3 sentences.",
    "You give navigation and planning guidance ONLY. Never give medical or first-aid advice.",
    "",
    `TREK: ${m.name} (${m.region}); difficulty ${m.difficulty}.`,
    `CURRENT POSITION: ${state.position[1].toFixed(4)}, ${state.position[0].toFixed(
      4
    )} at ${Math.round(state.elevation)} m, ${fmtDistance(
      state.distanceAlong
    )} along the trail.`,
    `CLOCK: ${fmt(state.now)} IST. Walking pace ~${state.paceKmh} km/h.`,
    "POINTS OF INTEREST:",
    poiLines,
    "",
    "When the trekker asks about making a summit/point before dark, call summit_feasibility. For water/shelter/exit call nearest. Quote the tool numbers back to them.",
  ].join("\n");
}

async function callChat(
  cfg: GemmaConfig,
  messages: ChatMessage[],
  useTools: boolean,
  signal?: AbortSignal
) {
  const res = await fetch(`${cfg.endpoint.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    signal,
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: 0.3,
      ...(useTools
        ? {
            tools: TOOL_DECLARATIONS.map((t) => ({
              type: "function",
              function: t,
            })),
            tool_choice: "auto",
          }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(`Gemma endpoint ${res.status}`);
  return res.json();
}

/** Quick reachability probe for the status indicator. */
export async function probeGemma(cfg = getConfig()): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${cfg.endpoint.replace(/\/$/, "")}/models`, {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Run the position-aware agent. Tries the live Gemma endpoint with native
 * function calling; falls back to the on-device deterministic planner.
 */
export async function runAgent(
  state: WorldState,
  userText: string,
  cfg = getConfig()
): Promise<AgentAnswer> {
  try {
    return await runOnlineAgent(state, userText, cfg);
  } catch {
    return localAgent(state, userText);
  }
}

async function runOnlineAgent(
  state: WorldState,
  userText: string,
  cfg: GemmaConfig
): Promise<AgentAnswer> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(state) },
    { role: "user", content: userText },
  ];
  const steps: AgentStep[] = [];

  for (let hop = 0; hop < 4; hop++) {
    const data = await callChat(cfg, messages, true);
    const choice = data.choices?.[0]?.message;
    if (!choice) throw new Error("empty response");

    if (choice.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: choice.content ?? null,
        tool_calls: choice.tool_calls,
      });
      for (const tc of choice.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* ignore malformed args */
        }
        const result = runTool(state, tc.function.name, args);
        steps.push({ tool: tc.function.name, args, result });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result.data),
        });
      }
      continue;
    }

    return { text: (choice.content ?? "").trim(), steps, online: true };
  }
  // Too many tool hops — summarise what we have.
  return {
    text: steps.map((s) => s.result.summary).join(" "),
    steps,
    online: true,
  };
}

/**
 * On-device deterministic planner. Detects intent, calls the SAME real tools,
 * and composes a guide-style answer. Numbers are never invented.
 */
export function localAgent(state: WorldState, userText: string): AgentAnswer {
  const q = userText.toLowerCase();
  const steps: AgentStep[] = [];
  const push = (tool: string, args: Record<string, unknown>, r: ToolResult) =>
    steps.push({ tool, args, result: r });

  // Detect a named target for feasibility questions.
  const namedTarget = state.manifest.pois.find((p) =>
    q.includes(p.name.toLowerCase().split(" ")[0])
  );

  const wantsFeasibility =
    /(make|reach|before dark|before sunset|in time|summit|top|camp|should i)/.test(
      q
    );
  const wantsWater = /(water|drink|refill|spring|stream|thirsty)/.test(q);
  const wantsShelter = /(shelter|cave|hut|storm|shelter|bivvy|weather)/.test(q);
  const wantsExit = /(exit|down|descend|bail|get out|road|escape|sos)/.test(q);
  const wantsSunset = /(sunset|dark|light|night|time)/.test(q);

  let text = "";

  if (wantsFeasibility) {
    const r = summit_feasibility(state, namedTarget?.name);
    push("summit_feasibility", { target: namedTarget?.name }, r);
    const sun = sunset_time(state);
    push("sunset_time", {}, sun);
    text = r.summary;
    if (r.data.verdict === "no" || r.data.verdict === "tight") {
      const camp = nearest(state, "campsite");
      push("nearest", { category: "campsite" }, camp);
      if (camp.ok) text += ` ${camp.summary}`;
    }
  } else if (wantsWater) {
    const r = nearest(state, "water");
    push("nearest", { category: "water" }, r);
    text = r.summary;
  } else if (wantsShelter) {
    const r = nearest(state, "shelter");
    push("nearest", { category: "shelter" }, r);
    text = r.summary;
  } else if (wantsExit) {
    const r = nearest(state, "exit");
    push("nearest", { category: "exit" }, r);
    text = r.summary;
  } else if (namedTarget) {
    const r = distance_to(state, namedTarget.name);
    push("distance_to", { poi: namedTarget.name }, r);
    text = r.summary;
  } else if (wantsSunset) {
    const r = sunset_time(state);
    push("sunset_time", {}, r);
    text = r.summary;
  } else {
    const sun = sunset_time(state);
    push("sunset_time", {}, sun);
    const water = nearest(state, "water");
    push("nearest", { category: "water" }, water);
    text = `You're at ${Math.round(state.elevation)} m, ${fmtDistance(
      state.distanceAlong
    )} in. ${sun.summary} ${water.summary}`;
  }

  return { text: text.trim(), steps, online: false };
}

/* --------------------------------------------------------------------------
 * Bhasha Bridge — speech-to-translated-text via Gemma's native audio input.
 * ------------------------------------------------------------------------ */

export interface TranslationResult {
  text: string;
  online: boolean;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = reader.result as string;
      resolve(s.split(",")[1] ?? s);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Send a <=30s audio clip to Gemma E4B for speech -> translated text.
 * Uses the OpenAI-compatible multimodal `input_audio` content part that
 * LiteRT-LM / Gemma 3n exposes. Fully offline against a local endpoint.
 */
export async function translateAudio(
  blob: Blob,
  targetLanguage: string,
  cfg = getConfig()
): Promise<TranslationResult> {
  const b64 = await blobToBase64(blob);
  const format = blob.type.includes("wav")
    ? "wav"
    : blob.type.includes("ogg")
      ? "ogg"
      : "webm";
  const body = {
    model: cfg.model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `You are a live translator. Listen to the audio clip and translate what is said into ${targetLanguage}. Reply with ONLY the translated text, no preamble.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Translate the following speech into ${targetLanguage}.`,
          },
          { type: "input_audio", input_audio: { data: b64, format } },
        ],
      },
    ],
  };
  const res = await fetch(
    `${cfg.endpoint.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Gemma audio endpoint ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  return { text: String(text).trim(), online: true };
}

/** Text -> translated text (used when audio transcript is typed, or as demo). */
export async function translateText(
  text: string,
  targetLanguage: string,
  cfg = getConfig()
): Promise<TranslationResult> {
  const res = await fetch(
    `${cfg.endpoint.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `Translate the user's message into ${targetLanguage}. Reply with ONLY the translation.`,
          },
          { role: "user", content: text },
        ],
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemma endpoint ${res.status}`);
  const data = await res.json();
  return {
    text: String(data.choices?.[0]?.message?.content ?? "").trim(),
    online: true,
  };
}

/**
 * Compose a rescue brief when a peer's SOS beacon appears. Raw peer data in,
 * a decision out — the on-device agentic loop applied to Humsafar. Tries
 * Gemma, falls back to the deterministic planner using real tools.
 */
export async function composeRescueBrief(
  state: WorldState,
  peer: { name: string; coord: [number, number]; status: string },
  cfg = getConfig()
): Promise<AgentAnswer> {
  const prompt = `A trekker named ${peer.name} has triggered SOS at ${peer.coord[1].toFixed(
    4
  )}, ${peer.coord[0].toFixed(
    4
  )}. Give me a one-line rescue brief: bearing and distance to them, rough time to reach at my pace, whether I have daylight margin, and the last water source before them. Navigation only.`;
  return runAgent(state, prompt, cfg);
}
