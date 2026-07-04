import {
  TOOL_DEFINITIONS,
  buildSystemPrompt,
  executeTool,
  interpolatePosition,
  type Position,
  estimateHikingMinutes,
  remainingAscent,
  sunsetTime,
} from "./trek-tools.js";

const LITERT_URL = process.env.LITERT_URL ?? "http://127.0.0.1:8080/v1";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const GEMMA_MODEL = process.env.GEMMA_MODEL ?? "gemma4:4b";

export type GemmaBackend = "litert-lm" | "ollama" | "simulator";

export async function detectBackend(): Promise<GemmaBackend> {
  try {
    const r = await fetch(`${LITERT_URL}/models`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) return "litert-lm";
  } catch {
    /* try next */
  }
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) return "ollama";
  } catch {
    /* fallback */
  }
  return "simulator";
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

async function callOpenAICompatible(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  tools = true,
): Promise<{
  content: string;
  tool_calls?: ToolCall[];
}> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.3,
    max_tokens: 512,
  };
  if (tools) body.tools = TOOL_DEFINITIONS;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices: Array<{ message: { content?: string; tool_calls?: ToolCall[] } }>;
  };
  const msg = data.choices[0]?.message ?? {};
  return { content: msg.content ?? "", tool_calls: msg.tool_calls };
}

async function callOllama(
  messages: ChatMessage[],
): Promise<{ content: string; tool_calls?: ToolCall[] }> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GEMMA_MODEL,
      messages,
      stream: false,
      tools: TOOL_DEFINITIONS,
    }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const data = (await res.json()) as {
    message: { content?: string; tool_calls?: ToolCall[] };
  };
  return {
    content: data.message.content ?? "",
    tool_calls: data.message.tool_calls,
  };
}

function simulatorGuide(question: string, position: Position): {
  reply: string;
  toolCalls: Array<{ name: string; result: unknown }>;
} {
  const q = question.toLowerCase();
  const toolCalls: Array<{ name: string; result: unknown }> = [];

  const ascent = remainingAscent(position);
  toolCalls.push({ name: "remaining_ascent", result: ascent });

  const sunset = sunsetTime(position.lat, position.lng);
  toolCalls.push({ name: "sunset_time", result: sunset });

  const hikeMinutes = estimateHikingMinutes(
    ascent.distanceToSummitKm,
    ascent.remainingM,
  );

  if (q.includes("summit") || q.includes("dark") || q.includes("sunset") || q.includes("triund")) {
    const margin = sunset.minutesUntilSunset - hikeMinutes;
    if (margin > 45) {
      return {
        toolCalls,
        reply: `Yes — push for ${ascent.summitName}. ${ascent.remainingM}m ascent over ${ascent.distanceToSummitKm.toFixed(1)} km (~${hikeMinutes} min at your pace). Sunset ${sunset.sunsetLocal}; you have ~${margin} min margin after summit. Carry a headlamp anyway.`,
      };
    }
    if (margin > 0) {
      return {
        toolCalls,
        reply: `Tight but possible: ~${hikeMinutes} min to summit, sunset in ${sunset.minutesUntilSunset} min (${sunset.sunsetLocal}). I'd camp at Snowline Café (${ascent.remainingM > 170 ? "1.4 km back" : "nearby"}) — safer than descending in twilight.`,
      };
    }
    return {
      toolCalls,
      reply: `No — sunset was ${Math.abs(sunset.minutesUntilSunset)} min ago. Do not continue to summit. Camp at the nearest meadow or descend toward Galu Temple while you still have civil twilight until ${sunset.civilTwilightEnd}.`,
    };
  }

  if (q.includes("water")) {
    const water = executeTool("nearest", { type: "water" }, position);
    toolCalls.push({ name: "nearest", result: water });
    return {
      toolCalls,
      reply: `Nearest water: ${(water as { poi: { name: string }; distanceKm: number; bearingLabel: string }).poi.name} — ${(water as { distanceKm: number }).distanceKm.toFixed(1)} km ${(water as { bearingLabel: string }).bearingLabel}. Fill up if flow looks good; last reliable source before ridge.`,
    };
  }

  if (q.includes("camp")) {
    const camp = executeTool("nearest", { type: "campsite" }, position);
    toolCalls.push({ name: "nearest", result: camp });
    return {
      toolCalls,
      reply: `Nearest campsite: ${(camp as { poi: { name: string } }).poi.name}. ${ascent.remainingM}m still to summit — good stop if weather turns or you're low on daylight.`,
    };
  }

  return {
    toolCalls,
    reply: `You're at ${position.elevationM}m, ${position.kmAlongTrail.toFixed(1)} km along the trail. ${ascent.remainingM}m to ${ascent.summitName}, sunset ${sunset.sunsetLocal}. Ask me about summit timing, water, camps, or SOS.`,
  };
}

function simulatorSosBrief(
  position: Position,
  sosPeer: { name: string; lat: number; lng: number; distanceKm: number },
): string {
  const sunset = sunsetTime(position.lat, position.lng);
  const hikeMin = estimateHikingMinutes(sosPeer.distanceKm, 200);
  return `SOS — ${sosPeer.name}, ${sosPeer.distanceKm.toFixed(1)} km northeast, below Laka Got ridge. At your pace: ~${hikeMin} minutes via the main trail. Sunset in ${Math.max(0, sunset.minutesUntilSunset)} minutes — ${sunset.minutesUntilSunset > hikeMin + 30 ? "you have margin" : "move now"}. Carry water; last source was the stream near Galu. Nearest human help is faster than helicopter dispatch from Dharamshala.`;
}

export async function trailSathiGuide(
  question: string,
  kmAlongTrail: number,
): Promise<{
  reply: string;
  position: Position;
  backend: GemmaBackend;
  toolCalls: Array<{ name: string; args?: unknown; result: unknown }>;
}> {
  const position = interpolatePosition(kmAlongTrail);
  const backend = await detectBackend();
  const systemPrompt = buildSystemPrompt(position);
  const toolCalls: Array<{ name: string; args?: unknown; result: unknown }> = [];

  if (backend === "simulator") {
    const sim = simulatorGuide(question, position);
    return {
      reply: sim.reply,
      position,
      backend,
      toolCalls: sim.toolCalls.map((t) => ({ name: t.name, result: t.result })),
    };
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: question },
  ];

  try {
    for (let round = 0; round < 4; round++) {
      const response =
        backend === "litert-lm"
          ? await callOpenAICompatible(LITERT_URL, GEMMA_MODEL, messages)
          : await callOllama(messages);

      if (!response.tool_calls?.length) {
        return {
          reply: response.content || "I couldn't form a response. Try again.",
          position,
          backend,
          toolCalls,
        };
      }

      messages.push({
        role: "assistant",
        content: response.content || "",
        // @ts-expect-error ollama/openai tool_calls shape
        tool_calls: response.tool_calls,
      });

      for (const tc of response.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
        const result = executeTool(tc.function.name, args, position);
        toolCalls.push({ name: tc.function.name, args, result });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: JSON.stringify(result),
        });
      }
    }

    const final =
      backend === "litert-lm"
        ? await callOpenAICompatible(LITERT_URL, GEMMA_MODEL, messages, false)
        : await callOllama(messages);

    return {
      reply: final.content,
      position,
      backend,
      toolCalls,
    };
  } catch (err) {
    const sim = simulatorGuide(question, position);
    return {
      reply: `${sim.reply}\n\n_(Gemma offline — showing tool-reasoned fallback. Start LiteRT-LM or Ollama for live E4B.)_`,
      position,
      backend: "simulator",
      toolCalls: sim.toolCalls.map((t) => ({ name: t.name, result: t.result })),
    };
  }
}

export async function bhashaTranslate(
  audioBase64: string,
  sourceLang: string,
  targetLang: string,
): Promise<{ transcription: string; translation: string; backend: GemmaBackend }> {
  const prompt = `Transcribe the following speech segment in ${sourceLang}, then translate it into ${targetLang}.
When formatting the answer, first output the transcription in ${sourceLang}, then one newline, then output the string '${targetLang}: ', then the translation in ${targetLang}.`;

  const backend = await detectBackend();

  if (backend === "ollama") {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GEMMA_MODEL,
          prompt,
          images: [audioBase64],
          stream: false,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { response: string };
        const parts = data.response.split("\n");
        const transcription = parts[0] ?? "";
        const translation = parts.slice(1).join("\n").replace(new RegExp(`^${targetLang}:\\s*`), "");
        return { transcription, translation, backend };
      }
    } catch {
      /* fall through */
    }
  }

  // Demo fallback translations for hackathon video
  const demos: Record<string, { transcription: string; translation: string }> = {
  "en-hi": {
      transcription: "Excuse me, is the trail to Triund still open? Is there water ahead?",
      translation: "माफ़ कीजिए, क्या त्रियुंड का रास्ता अभी भी खुला है? आगे पानी मिलेगा?",
    },
    "hi-en": {
      transcription: "हाँ, रास्ता खुला है। आगे मैजिक व्यू के पास पानी मिलेगा।",
      translation: "Yes, the trail is open. You'll find water near Magic View Café ahead.",
    },
  };
  const key = `${sourceLang.slice(0, 2).toLowerCase()}-${targetLang.slice(0, 2).toLowerCase()}`;
  const demo = demos[key] ?? demos["en-hi"];
  return {
    ...demo,
    backend: "simulator",
  };
}

export function humsafarSosBrief(
  kmAlongTrail: number,
  sosPeer: { name: string; lat: number; lng: number },
): string {
  const position = interpolatePosition(kmAlongTrail);
  const distKm = Math.hypot(
    (sosPeer.lat - position.lat) * 111,
    (sosPeer.lng - position.lng) * 111 * Math.cos((position.lat * Math.PI) / 180),
  );
  return simulatorSosBrief(position, { ...sosPeer, distanceKm: distKm });
}
