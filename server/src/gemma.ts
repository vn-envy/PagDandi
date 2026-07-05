import {
  TOOL_DEFINITIONS,
  bearingDegrees,
  bearingLabel,
  buildSystemPrompt,
  executeTool,
  haversineKm,
  interpolatePosition,
  loadManifest,
  nearestPoi,
  type Position,
  estimateHikingMinutes,
  remainingAscent,
  sunsetTime,
} from "./trek-tools.js";

const LITERT_URL = process.env.LITERT_URL ?? "http://127.0.0.1:8080/v1";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const GEMMA_MODEL = process.env.GEMMA_MODEL ?? "gemma4:e4b";

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
  // Ollama returns arguments as an object; OpenAI-compatible servers as a JSON string
  function: { name: string; arguments: string | Record<string, unknown> };
}

function parseToolArgs(args: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args) return {};
  if (typeof args === "string") {
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return args;
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

let ollamaSupportsTools: boolean | null = null;

async function callOllama(
  messages: ChatMessage[],
  useNativeTools = true,
): Promise<{ content: string; tool_calls?: ToolCall[] }> {
  const withTools = useNativeTools && ollamaSupportsTools !== false;
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GEMMA_MODEL,
      messages,
      stream: false,
      think: false, // thinking mode adds ~30s/turn on CPU; disable for trail latency
      options: { temperature: 0.3, num_ctx: 4096 },
      ...(withTools ? { tools: TOOL_DEFINITIONS } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    // Model lacks native tool support — remember and retry via prompt-based tools
    if (withTools && /does not support tools/i.test(text)) {
      ollamaSupportsTools = false;
      return callOllama(messages, false);
    }
    throw new Error(`Ollama error ${res.status}: ${text.slice(0, 200)}`);
  }
  if (withTools) ollamaSupportsTools = true;
  const data = (await res.json()) as {
    message: { content?: string; tool_calls?: ToolCall[] };
  };
  let content = data.message.content ?? "";
  let tool_calls = data.message.tool_calls;

  // Prompt-based tool calling: parse ```tool_call {...}``` JSON blocks the
  // system prompt asks for when native tools are unavailable.
  if (!tool_calls?.length) {
    const parsed = parsePromptToolCalls(content);
    if (parsed.length) {
      tool_calls = parsed;
      content = "";
    }
  }
  return { content, tool_calls };
}

function parsePromptToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const regex = /```(?:tool_call|json)?\s*(\{[\s\S]*?\})\s*```/g;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(content)) !== null) {
    try {
      const obj = JSON.parse(match[1]) as {
        name?: string;
        tool?: string;
        arguments?: Record<string, unknown>;
        parameters?: Record<string, unknown>;
      };
      const name = obj.name ?? obj.tool;
      if (!name) continue;
      const validNames = TOOL_DEFINITIONS.map((t) => t.function.name);
      if (!validNames.includes(name)) continue;
      calls.push({
        id: `prompt-tc-${Date.now()}-${i++}`,
        type: "function",
        function: {
          name,
          arguments: JSON.stringify(obj.arguments ?? obj.parameters ?? {}),
        },
      });
    } catch {
      /* not a tool call */
    }
  }
  return calls;
}

export function promptToolInstructions(): string {
  const tools = TOOL_DEFINITIONS.map(
    (t) =>
      `- ${t.function.name}(${Object.keys(t.function.parameters.properties ?? {}).join(", ")}): ${t.function.description}`,
  ).join("\n");
  return `

TOOLS AVAILABLE (call before making any distance/time/elevation claim):
${tools}

To call a tool, reply with ONLY a fenced block:
\`\`\`tool_call
{"name": "<tool_name>", "arguments": {}}
\`\`\`
After receiving the tool result, give your final answer as plain text with no code fences.`;
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

/** Structured rescue brief — the shape Gemma is asked to emit (JSON schema). */
export interface SosBriefStructured {
  etaMin: number;
  distanceKm: number;
  bearing: string;
  hazards: string[];
  advice: string;
}

const SOS_BRIEF_SCHEMA = {
  type: "object",
  properties: {
    etaMin: { type: "integer", description: "Minutes for the rescuer to reach the SOS peer on foot" },
    hazards: { type: "array", items: { type: "string" }, description: "2-3 short hazard warnings for the route, most urgent first" },
    advice: { type: "string", description: "2-3 decisive sentences: route to take, what to carry, what to do on arrival. Navigation only, no medical advice." },
  },
  required: ["etaMin", "hazards", "advice"],
} as const;

/** Deterministic grounding facts + fallback brief. Same tool functions Gemma uses. */
function sosGrounding(position: Position, sosPeer: { name: string; lat: number; lng: number }) {
  const distanceKm = haversineKm(position.lat, position.lng, sosPeer.lat, sosPeer.lng);
  const bearing = bearingLabel(bearingDegrees(position.lat, position.lng, sosPeer.lat, sosPeer.lng));
  const sunset = sunsetTime(position.lat, position.lng);
  const etaMin = estimateHikingMinutes(distanceKm, 200);
  const water = nearestPoi(position, "water");
  const shelter = nearestPoi(position, "shelter");
  const toolCalls = [
    { name: "sunset_time", result: sunset },
    { name: "nearest", args: { type: "water" }, result: { poi: water.poi.name, distanceKm: water.distanceKm } },
    { name: "nearest", args: { type: "shelter" }, result: { poi: shelter.poi.name, distanceKm: shelter.distanceKm } },
  ];

  const hazards: string[] = [];
  if (sunset.minutesUntilSunset < etaMin) {
    hazards.push(`You arrive after sunset (${sunset.sunsetLocal}) — headlamp required`);
  } else if (sunset.minutesUntilSunset < etaMin + 45) {
    hazards.push(`Thin daylight margin — sunset ${sunset.sunsetLocal}`);
  }
  if (position.elevationM > 2650 || distanceKm > 2.5) {
    hazards.push("Exposed ground above Snowline — wind chill, loose scree");
  }
  hazards.push("Stay on the main trail; never descend gullies in fading light");

  const fallback: SosBriefStructured = {
    etaMin,
    distanceKm: Number(distanceKm.toFixed(1)),
    bearing,
    hazards: hazards.slice(0, 3),
    advice: `Move now via the main trail toward ${sosPeer.name}. Fill water at ${water.poi.name} if passing (${water.distanceKm.toFixed(1)} km). On arrival, mark position with the LKP code and get them to ${shelter.poi.name} if mobile. The nearest human is almost always faster than a helicopter from Dharamshala.`,
  };
  return { distanceKm, bearing, sunset, etaMin, water, shelter, toolCalls, fallback };
}

function sosBriefText(b: SosBriefStructured, peerName: string): string {
  return `SOS — ${peerName}, ${b.distanceKm.toFixed(1)} km ${b.bearing} of you, ~${b.etaMin} min on foot. ${b.hazards.join(". ")}. ${b.advice}`;
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

  const systemWithTools =
    backend === "ollama" && ollamaSupportsTools === false
      ? systemPrompt + promptToolInstructions()
      : systemPrompt;

  const messages: ChatMessage[] = [
    { role: "system", content: systemWithTools },
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

      const promptBasedTools = backend === "ollama" && ollamaSupportsTools === false;

      if (promptBasedTools) {
        // Models without native tool templates reject assistant tool_calls and
        // the tool role — feed results back as plain conversation turns.
        const results: string[] = [];
        for (const tc of response.tool_calls) {
          const args = parseToolArgs(tc.function.arguments);
          const result = executeTool(tc.function.name, args, position);
          toolCalls.push({ name: tc.function.name, args, result });
          results.push(`${tc.function.name}(${JSON.stringify(args)}) → ${JSON.stringify(result)}`);
        }
        messages.push({ role: "assistant", content: `Calling tools:\n${results.map((r) => r.split(" →")[0]).join("\n")}` });
        messages.push({
          role: "user",
          content: `TOOL RESULTS:\n${results.join("\n")}\n\nNow answer the original question in plain text using these results.`,
        });
      } else {
        messages.push({
          role: "assistant",
          content: response.content || "",
          // @ts-expect-error ollama/openai tool_calls shape
          tool_calls: response.tool_calls,
        });

        for (const tc of response.tool_calls) {
          const args = parseToolArgs(tc.function.arguments);
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

/** Transcode any browser audio (webm/ogg/mp4) to 16kHz mono WAV — Gemma's required format. */
async function transcodeTo16kWav(audioBase64: string): Promise<string | null> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { writeFile, readFile, rm, mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = await mkdtemp(join(tmpdir(), "bhasha-"));
  const input = join(dir, "in.audio");
  const output = join(dir, "out.wav");
  try {
    await writeFile(input, Buffer.from(audioBase64, "base64"));
    await promisify(execFile)("ffmpeg", [
      "-y",
      "-i", input,
      "-ar", "16000",
      "-ac", "1",
      "-t", "30", // enforce the 30-second clip limit
      output,
    ]);
    const wav = await readFile(output);
    return wav.toString("base64");
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function bhashaTranslate(
  audioBase64: string,
  sourceLang: string,
  targetLang: string,
): Promise<{ transcription: string; translation: string; backend: GemmaBackend }> {
  // Nonce defeats ollama's prompt-prefix KV cache (see prakritiLens).
  const prompt = `[clip ${Date.now().toString(36)}] Transcribe the following speech segment in ${sourceLang}, then translate it into ${targetLang}.
When formatting the answer, first output the transcription in ${sourceLang}, then one newline, then output the string '${targetLang}: ', then the translation in ${targetLang}.`;

  const backend = await detectBackend();

  if (backend === "ollama" && audioBase64 !== "demo") {
    try {
      const wavBase64 = await transcodeTo16kWav(audioBase64);
      if (wavBase64) {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(120_000),
          body: JSON.stringify({
            model: GEMMA_MODEL,
            prompt,
            images: [wavBase64],
            stream: false,
            think: false,
            options: { temperature: 0.1, num_predict: 300 },
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { response: string };
          const raw = data.response.trim();
          const marker = new RegExp(`^${targetLang}:\\s*`, "im");
          const lines = raw.split("\n").filter((l) => l.trim());
          const translationLineIdx = lines.findIndex((l) => marker.test(l));
          if (translationLineIdx > 0) {
            return {
              transcription: lines.slice(0, translationLineIdx).join(" "),
              translation: lines
                .slice(translationLineIdx)
                .join(" ")
                .replace(marker, ""),
              backend,
            };
          }
          return { transcription: raw, translation: raw, backend };
        }
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

const LENS_DEMOS = [
  {
    subject: "Rhododendron arboreum (बुरांश / Burans)",
    reply:
      "Rhododendron arboreum — बुरांश (Burans), Himachal's state flower. Those deep-red blooms cover the Dhauladhar slopes between 1,500–3,000m in spring. Locals make a famous sharbat from the petals, and you'll see the twisted trunks used as trail markers. At your elevation this is the dominant flowering tree — where burans thrives, you're still below the treeline.",
  },
  {
    subject: "Himalayan Griffon (Gyps himalayensis)",
    reply:
      "Himalayan Griffon vulture — one of the largest birds in the Himalaya with a near 3m wingspan. They ride the thermals off the Dhauladhar ridge most afternoons. Seeing them circling low can mean livestock carcass nearby — shepherds' dogs may be around, give them space.",
  },
] as const;

export async function prakritiLens(
  imageBase64: string,
  kmAlongTrail: number,
): Promise<{ reply: string; backend: GemmaBackend; position: Position }> {
  const position = interpolatePosition(kmAlongTrail);
  const manifest = loadManifest();
  // Prompt structure matters: with a long persona-first prompt, gemma4:e4b
  // intermittently claims no image was attached (even though ollama decodes
  // it — visible as "image decoded" in server logs). Anchoring on the image
  // in the first sentence and keeping instructions tight fixes it. The nonce
  // defeats ollama's prompt-prefix KV cache.
  const prompt = `Look carefully at the attached photo. It was just taken on the ${manifest.name} trail (${manifest.region}) at about ${position.elevationM}m elevation.

First, describe what you actually see. Then, speaking as Prakriti Lens — a warm, knowledgeable local sherpa-naturalist — explain it in 3-5 sentences: common name (with Hindi/Pahari local name and scientific name if it's a plant or animal), its ecology at this altitude, and any trail lore or practical relevance.

Safety rules: mention hazards (aggressive wildlife, thorns, unstable ground) when relevant, but give absolutely NO medical, edibility, or foraging advice — if locals traditionally use a plant you may say so, adding that trekkers must never consume wild plants.
[shot ${Date.now().toString(36)}]`;

  const backend = await detectBackend();

  // gemma4:e4b via ollama intermittently ignores the attached image even
  // though the runtime decodes it (verified in ollama logs). Detect the
  // refusal pattern and retry — the second attempt nearly always sees it.
  const refusalPattern =
    /(no image|cannot (directly )?["']?(look|see|view)|not provided|unable to (view|see)|provide the (image|photo|picture))/i;

  if (backend === "ollama" && imageBase64 && imageBase64 !== "demo") {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(120_000),
          body: JSON.stringify({
            model: GEMMA_MODEL,
            prompt: `${prompt}\n[attempt ${attempt}-${Date.now().toString(36)}]`,
            images: [imageBase64],
            stream: false,
            think: false,
            // num_predict caps runaway generations that stall low-RAM CPU boxes
            options: { temperature: 0.4, num_predict: 260 },
          }),
        });
        if (!res.ok) break;
        const data = (await res.json()) as { response: string };
        const reply = data.response.trim();
        if (!refusalPattern.test(reply.slice(0, 200))) {
          return { reply, backend, position };
        }
        console.log(`[lens] model ignored image (attempt ${attempt + 1}/2), retrying`);
      }
    } catch {
      /* fall through */
    }
  }

  const demo = LENS_DEMOS[Math.floor(Math.random() * LENS_DEMOS.length)];
  return {
    reply: `${demo.reply}\n\n_(Demo response — connect Gemma for live identification.)_`,
    backend: "simulator",
    position,
  };
}

/**
 * SOS rescue brief. Safety path: accuracy beats latency, so thinking mode is
 * ON here (it is disabled on the chat path). Output is schema-constrained
 * JSON via ollama's `format`; any failure falls back to the deterministic
 * tool-computed brief — always labeled with its backend.
 */
export async function humsafarSosBrief(
  kmAlongTrail: number,
  sosPeer: { name: string; lat: number; lng: number },
): Promise<{ brief: SosBriefStructured; text: string; backend: GemmaBackend; toolCalls: Array<{ name: string; args?: unknown; result: unknown }> }> {
  const position = interpolatePosition(kmAlongTrail);
  const g = sosGrounding(position, sosPeer);
  const backend = await detectBackend();

  if (backend === "ollama") {
    try {
      const facts = [
        `Rescuer position: ${position.lat.toFixed(5)},${position.lng.toFixed(5)} at ${position.elevationM}m, ${position.kmAlongTrail.toFixed(1)} km along trail`,
        `SOS peer: ${sosPeer.name} at ${sosPeer.lat.toFixed(5)},${sosPeer.lng.toFixed(5)} — ${g.distanceKm.toFixed(1)} km ${g.bearing} of rescuer`,
        `Naismith ETA on foot: ~${g.etaMin} min`,
        `Sunset: ${g.sunset.sunsetLocal} (${g.sunset.minutesUntilSunset} min from now), civil twilight ends ${g.sunset.civilTwilightEnd}`,
        `Nearest water to rescuer: ${g.water.poi.name}, ${g.water.distanceKm.toFixed(1)} km ${g.water.bearingLabel}`,
        `Nearest shelter: ${g.shelter.poi.name}, ${g.shelter.distanceKm.toFixed(1)} km ${g.shelter.bearingLabel}`,
      ].join("\n");

      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          model: GEMMA_MODEL,
          stream: false,
          think: true, // SOS: precision over latency
          format: SOS_BRIEF_SCHEMA,
          options: { temperature: 0.2, num_predict: 400 },
          messages: [
            {
              role: "system",
              content:
                "You are Trail Sathi composing a rescue brief for a trekker responding to a peer's SOS beacon on the Triund trail. Use ONLY the facts provided. Navigation and logistics only — absolutely no medical advice. Be decisive.",
            },
            { role: "user", content: `FACTS:\n${facts}\n\nCompose the rescue brief as JSON.` },
          ],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { message: { content?: string } };
        const parsed = JSON.parse(data.message.content ?? "{}") as Partial<SosBriefStructured>;
        if (typeof parsed.etaMin === "number" && Array.isArray(parsed.hazards) && typeof parsed.advice === "string") {
          const brief: SosBriefStructured = {
            etaMin: Math.round(parsed.etaMin),
            distanceKm: Number(g.distanceKm.toFixed(1)),
            bearing: g.bearing,
            hazards: parsed.hazards.slice(0, 3).map(String),
            advice: parsed.advice,
          };
          return { brief, text: sosBriefText(brief, sosPeer.name), backend, toolCalls: g.toolCalls };
        }
      }
    } catch {
      /* fall through to deterministic brief */
    }
  }

  return {
    brief: g.fallback,
    text: sosBriefText(g.fallback, sosPeer.name),
    backend: "simulator",
    toolCalls: g.toolCalls,
  };
}
