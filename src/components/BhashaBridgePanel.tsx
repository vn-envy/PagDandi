import { useEffect, useRef, useState } from "react";
import { Languages, Loader2, Mic, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { translateAudio, translateText } from "@/lib/gemma";

const LANGUAGES = [
  "Hindi",
  "English",
  "Gaddi (Himachali)",
  "Nepali",
  "Punjabi",
  "German",
  "French",
  "Japanese",
];

const MAX_MS = 30_000;

interface Result {
  text: string;
  online: boolean;
}

export function BhashaBridgePanel() {
  const [target, setTarget] = useState("Hindi");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => stopTimer(), []);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function start() {
    setError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        void handleClip(blob);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setElapsed(0);
      const startT = Date.now();
      timerRef.current = window.setInterval(() => {
        const ms = Date.now() - startT;
        setElapsed(ms);
        if (ms >= MAX_MS) stop();
      }, 100);
    } catch {
      setError("Microphone permission denied or unavailable.");
    }
  }

  function stop() {
    stopTimer();
    setRecording(false);
    recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
  }

  async function handleClip(blob: Blob) {
    setBusy(true);
    try {
      const r = await translateAudio(blob, target);
      setResult(r);
      speak(r.text);
    } catch {
      setError(
        "Couldn't reach the local Gemma audio endpoint. Start LiteRT-LM / Ollama, or type text below to translate."
      );
    } finally {
      setBusy(false);
    }
  }

  async function translateManual() {
    if (!manual.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await translateText(manual, target);
      setResult(r);
      speak(r.text);
    } catch {
      setError("Local Gemma endpoint unreachable. Check Settings.");
    } finally {
      setBusy(false);
    }
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window) || !text) return;
    const u = new SpeechSynthesisUtterance(text);
    const map: Record<string, string> = {
      Hindi: "hi-IN",
      English: "en-IN",
      Nepali: "ne-NP",
      Punjabi: "pa-IN",
      German: "de-DE",
      French: "fr-FR",
      Japanese: "ja-JP",
    };
    u.lang = map[target] ?? "hi-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  const pct = Math.min(100, (elapsed / MAX_MS) * 100);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Languages className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Bhasha Bridge</span>
        <Badge variant="accent" className="ml-auto">
          Gemma audio · 35+ langs
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Hold the phone up to a Gaddi shepherd. Speech in, translated text out —
        up to 30 seconds, fully offline via Gemma's native audio input.
      </p>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Translate to</span>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="h-9 flex-1 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {LANGUAGES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-secondary/40 p-4">
        {!recording ? (
          <Button size="lg" onClick={start} disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            {busy ? "Translating…" : "Hold to speak"}
          </Button>
        ) : (
          <Button size="lg" variant="destructive" onClick={stop} className="w-full">
            <Square className="h-4 w-4" /> Stop ({Math.ceil((MAX_MS - elapsed) / 1000)}s)
          </Button>
        )}
        {recording && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-destructive transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{error}</div>
      )}

      {result && (
        <div className="rounded-xl border border-border bg-secondary/40 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {target}
            </span>
            <button
              onClick={() => speak(result.text)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Play translation"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          </div>
          <p className="text-base leading-relaxed">{result.text}</p>
        </div>
      )}

      <div className="border-t border-border pt-3">
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Or type text to translate
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && translateManual()}
            placeholder="e.g. Is the path ahead safe?"
            className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="sm" onClick={translateManual} disabled={busy || !manual.trim()}>
            Translate
          </Button>
        </div>
      </div>
    </div>
  );
}
