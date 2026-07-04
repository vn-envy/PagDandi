/**
 * Bhasha Bridge — speech-to-translated-text, fully offline.
 *
 * Gemma E4B's edge builds natively accept audio (max ~30 s clips). We record
 * with MediaRecorder and hand the clip to the local runtime using its audio
 * prompt format. Two transport shapes are attempted:
 *   1. OpenAI-style content parts with `input_audio` (LiteRT-LM serve)
 *   2. Ollama-style message with an `audio` array (experimental builds)
 * If the local runtime can't take audio, the UI degrades to text-in /
 * text-out translation through the same model — and says so on screen.
 */

const LLM_BASE = "/llm";
const MODEL = () => localStorage.getItem("pagdandi.model") ?? "gemma3n:e4b";
export const MAX_CLIP_SECONDS = 30;

export interface TranslationResult {
  transcript: string | null;
  translation: string;
  mode: "audio" | "text";
}

export const LANGUAGES = [
  { code: "hi", label: "Hindi (हिन्दी)" },
  { code: "en", label: "English" },
  { code: "pa", label: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "ne", label: "Nepali (नेपाली)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "he", label: "Hebrew (עברית)" },
  { code: "ja", label: "Japanese (日本語)" },
];

function langLabel(code: string) {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

export class ClipRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder;
      if (!rec) return reject(new Error("not recording"));
      rec.onstop = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: rec.mimeType || "audio/webm" }));
      };
      rec.stop();
    });
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

const audioSystem = (target: string) =>
  `You are a translator on a Himalayan trail. Listen to the audio clip. First transcribe what was said, then translate it into ${langLabel(target)}. Reply as JSON: {"transcript": "...", "translation": "..."} — nothing else.`;

export async function translateAudio(clip: Blob, targetLang: string): Promise<TranslationResult> {
  const b64 = await blobToBase64(clip);

  // 1. OpenAI-compatible content parts (LiteRT-LM serve)
  try {
    const res = await fetch(`${LLM_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL(),
        messages: [
          { role: "system", content: audioSystem(targetLang) },
          {
            role: "user",
            content: [
              { type: "input_audio", input_audio: { data: b64, format: "wav" } },
              { type: "text", text: "Transcribe and translate this clip." },
            ],
          },
        ],
        temperature: 0.2,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? "";
      const parsed = tryParse(text);
      if (parsed) return { ...parsed, mode: "audio" };
    }
  } catch {
    // endpoint down or shape unsupported — try Ollama shape
  }

  // 2. Ollama-style audio attachment (experimental multimodal builds)
  const res = await fetch(`${LLM_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL(),
      stream: false,
      messages: [
        { role: "system", content: audioSystem(targetLang) },
        { role: "user", content: "Transcribe and translate this clip.", audio: [b64] },
      ],
      options: { temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`audio translation unsupported by local runtime (${res.status})`);
  const data = await res.json();
  const text = data.message?.content ?? "";
  const parsed = tryParse(text);
  if (!parsed) throw new Error("model returned unparseable audio result");
  return { ...parsed, mode: "audio" };
}

export async function translateText(text: string, targetLang: string): Promise<TranslationResult> {
  const res = await fetch(`${LLM_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL(),
      stream: false,
      messages: [
        {
          role: "system",
          content: `Translate the user's message into ${langLabel(targetLang)}. Natural spoken register, as one villager to another. Reply with ONLY the translation.`,
        },
        { role: "user", content: text },
      ],
      options: { temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`translation endpoint error ${res.status}`);
  const data = await res.json();
  return { transcript: text, translation: (data.message?.content ?? "").trim(), mode: "text" };
}

function tryParse(text: string): { transcript: string | null; translation: string } | null {
  const brace = text.match(/\{[\s\S]*\}/);
  if (brace) {
    try {
      const obj = JSON.parse(brace[0]);
      if (obj.translation) return { transcript: obj.transcript ?? null, translation: obj.translation };
    } catch {
      // fall through
    }
  }
  return text.trim() ? { transcript: null, translation: text.trim() } : null;
}

/** Read the translation aloud with the on-device TTS voices. */
export function speak(text: string, langCode: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const wanted = langCode === "hi" ? "hi-IN" : langCode;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(wanted));
  if (voice) utter.voice = voice;
  utter.lang = voice?.lang ?? wanted;
  utter.rate = 0.95;
  window.speechSynthesis.speak(utter);
}
