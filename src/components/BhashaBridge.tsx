import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Keyboard, Languages, Mic, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ClipRecorder,
  LANGUAGES,
  MAX_CLIP_SECONDS,
  speak,
  translateAudio,
  translateText,
  type TranslationResult,
} from "@/lib/translate";
import { cn } from "@/lib/utils";

export function BhashaBridge() {
  const [targetLang, setTargetLang] = useState("hi");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [textMode, setTextMode] = useState(false);
  const [textInput, setTextInput] = useState("");
  const recorderRef = useRef<ClipRecorder | null>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_CLIP_SECONDS) stopRecording();
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const startRecording = async () => {
    setError(null);
    setResult(null);
    try {
      const rec = new ClipRecorder();
      await rec.start();
      recorderRef.current = rec;
      setSeconds(0);
      setRecording(true);
    } catch {
      setError("Microphone unavailable. Use text mode below.");
      setTextMode(true);
    }
  };

  const stopRecording = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    setRecording(false);
    setBusy(true);
    try {
      const clip = await rec.stop();
      const r = await translateAudio(clip, targetLang);
      setResult(r);
    } catch {
      setError(
        "The local runtime couldn't take audio — falling back to text-in / text-out translation (cut line #1, as documented).",
      );
      setTextMode(true);
    } finally {
      setBusy(false);
    }
  };

  const runTextTranslate = async () => {
    if (!textInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await translateText(textInput, targetLang);
      setResult(r);
    } catch {
      setError("No local model endpoint reachable. Start LiteRT-LM serve or `ollama serve` with Gemma E4B.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Languages className="size-4 text-sky-500" />
        <div className="flex-1">
          <div className="text-sm font-semibold leading-none">Bhasha Bridge</div>
          <div className="text-muted-foreground mt-0.5 text-[11px]">
            Speak → translated text · ≤{MAX_CLIP_SECONDS}s clips · fully offline
          </div>
        </div>
        <Badge variant="secondary" className="text-[9px]">
          GEMMA AUDIO-IN
        </Badge>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Translate into</span>
          <select
            className="bg-background flex-1 rounded-md border px-2 py-1.5 text-sm"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {!textMode ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={busy}
              aria-label={recording ? "Stop recording" : "Start recording"}
              className={cn(
                "relative flex size-20 items-center justify-center rounded-full text-white shadow-xl transition-colors",
                recording ? "pd-pulse bg-red-500 text-red-500" : "bg-sky-500 hover:bg-sky-600",
                busy && "opacity-50",
              )}
            >
              {recording ? <Square className="size-7 fill-white text-white" /> : <Mic className="size-8" />}
            </button>
            <div className="text-muted-foreground text-xs tabular-nums">
              {recording
                ? `Recording… ${seconds}s / ${MAX_CLIP_SECONDS}s — tap to translate`
                : busy
                  ? "Gemma is listening…"
                  : "Hold the phone up. Tap to record."}
            </div>
            <button
              className="text-muted-foreground flex items-center gap-1 text-[11px] underline decoration-dotted"
              onClick={() => setTextMode(true)}
            >
              <Keyboard className="size-3" /> type instead
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type what you want to say…"
              className="min-h-20 text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={runTextTranslate} disabled={busy || !textInput.trim()}>
                <ArrowRightLeft className="size-3.5" /> Translate
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTextMode(false)}>
                <Mic className="size-3.5" /> back to voice
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>}

        {result && (
          <div className="space-y-2">
            {result.transcript && (
              <div className="bg-muted rounded-lg p-3">
                <div className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">Heard</div>
                <p className="text-sm">{result.transcript}</p>
              </div>
            )}
            <div className="rounded-lg border-2 border-sky-500/40 bg-sky-500/5 p-3">
              <div className="text-muted-foreground mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide">
                <span>{LANGUAGES.find((l) => l.code === targetLang)?.label}</span>
                <span>{result.mode === "audio" ? "audio → text" : "text → text"}</span>
              </div>
              <p className="text-lg leading-snug font-medium">{result.translation}</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 h-7 px-2 text-xs"
                onClick={() => speak(result.translation, targetLang)}
              >
                <Volume2 className="size-3.5" /> read aloud
              </Button>
            </div>
          </div>
        )}

        <p className="text-muted-foreground text-[10px] leading-relaxed">
          For the Gaddi shepherd you'll actually meet up there: 35+ languages, no network, no
          account, nothing leaves the phone.
        </p>
      </div>
    </div>
  );
}
