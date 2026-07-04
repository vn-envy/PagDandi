"use client";

import { useRef, useState } from "react";
import { Languages, Loader2, Mic, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SERVER_URL } from "@/lib/types";

const MAX_RECORD_MS = 30_000;

export function BhashaBridge() {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [backend, setBackend] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await translateAudio(blob);
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
      timerRef.current = setTimeout(() => stopRecording(), MAX_RECORD_MS);
    } catch {
      // Demo without mic — use placeholder audio flag
      await translateAudio(null);
    }
  }

  function stopRecording() {
    if (timerRef.current) clearTimeout(timerRef.current);
    mediaRef.current?.stop();
    setRecording(false);
  }

  async function blobToBase64(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async function translateAudio(blob: Blob | null) {
    setLoading(true);
    setTranscription(null);
    setTranslation(null);
    try {
      const audioBase64 = blob ? await blobToBase64(blob) : "demo";
      const res = await fetch(`${SERVER_URL}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64,
          sourceLang: "English",
          targetLang: "Hindi",
        }),
      });
      const data = await res.json();
      setTranscription(data.transcription);
      setTranslation(data.translation);
      setBackend(data.backend);

      if (typeof window !== "undefined" && data.translation && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(data.translation);
        utterance.lang = "hi-IN";
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      setTranslation("सर्वर से कनेक्ट नहीं हो सका।");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Languages className="size-4 text-sky-400" />
          Bhasha Bridge
          <Badge variant="secondary" className="ml-auto text-[10px]">
            35+ langs · offline
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Hold up to a shepherd — English in, Hindi out. Max 30s clip.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {!recording ? (
            <Button onClick={startRecording} disabled={loading} className="flex-1">
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Mic className="size-4" /> Hold & speak
                </>
              )}
            </Button>
          ) : (
            <Button variant="destructive" onClick={stopRecording} className="flex-1 animate-pulse">
              <Square className="size-4" /> Recording… (max 30s)
            </Button>
          )}
        </div>

        {transcription && (
          <div className="rounded-lg border p-2">
            <p className="text-[10px] text-muted-foreground">English</p>
            <p className="text-sm">{transcription}</p>
          </div>
        )}
        {translation && (
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-2">
            <p className="flex items-center gap-1 text-[10px] text-sky-600 dark:text-sky-400">
              <Volume2 className="size-3" /> Hindi
            </p>
            <p className="text-sm font-medium">{translation}</p>
            {backend && (
              <p className="mt-1 text-[10px] text-muted-foreground">via {backend}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
