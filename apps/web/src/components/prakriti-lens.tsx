"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FlipHorizontal, Leaf, Loader2, RefreshCw, Upload, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SERVER_URL } from "@/lib/types";

const MAX_DIM = 1024;

interface PrakritiLensProps {
  kmAlongTrail: number;
}

export function PrakritiLens({ kmAlongTrail }: PrakritiLensProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [backend, setBackend] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<Array<{ name: string; result: unknown }>>([]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCameraError(true);
    }
  }, [facing, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  function downscaleToJpeg(source: HTMLVideoElement | HTMLImageElement): string {
    const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(srcW * scale);
    canvas.height = Math.round(srcH * scale);
    canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function identify(dataUrl: string) {
    setSnapshot(dataUrl);
    setLoading(true);
    setReply(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/lens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUrl.split(",")[1],
          kmAlongTrail,
        }),
      });
      const data = await res.json();
      setReply(data.reply);
      setBackend(data.backend);
      setToolCalls(data.toolCalls ?? []);
    } catch {
      setReply("Could not reach Prakriti Lens. Is the local server running?");
    } finally {
      setLoading(false);
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !cameraOn) return;
    identify(downscaleToJpeg(video));
    stopCamera();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      identify(downscaleToJpeg(img));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
    e.target.value = "";
  }

  function speak() {
    if (reply && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply.replace(/_/g, "")));
    }
  }

  function reset() {
    setSnapshot(null);
    setReply(null);
    startCamera();
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Leaf className="size-4 text-muted-foreground" />
          Prakriti Lens
          <Badge variant="secondary" className="ml-auto text-[10px]">
            Gemma vision · offline
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Point at flora, fauna, or peaks — your sherpa explains what you&apos;re seeing.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-black/80">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {snapshot ? (
            <img src={snapshot} alt="Captured" className="h-full w-full object-contain" />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          )}
          {!cameraOn && !snapshot && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
              <Camera className="size-8" />
              <p className="text-xs">
                {cameraError ? "Camera unavailable — upload a photo instead" : "Camera is off"}
              </p>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-white">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">Sherpa is looking…</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {!snapshot ? (
            !cameraOn ? (
              <Button onClick={startCamera} className="flex-1">
                <Camera className="size-4" /> Open camera
              </Button>
            ) : (
              <>
                <Button onClick={capture} className="flex-1">
                  <Camera className="size-4" /> Capture
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                  aria-label="Flip camera"
                >
                  <FlipHorizontal className="size-4" />
                </Button>
              </>
            )
          ) : (
            <Button variant="outline" onClick={reset} className="flex-1" disabled={loading}>
              <RefreshCw className="size-4" /> New shot
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            aria-label="Upload photo"
          >
            <Upload className="size-4" />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onFileChosen}
          />
        </div>

        {reply && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <p className="text-sm leading-relaxed">{reply}</p>
            {toolCalls.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {toolCalls.map((tc, i) => (
                  <span
                    key={i}
                    className="rounded-full border bg-background px-2 py-0.5 font-mono text-[9px] text-muted-foreground"
                  >
                    {tc.name}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                {backend && `via ${backend}`} · no foraging or medical advice, ever
              </p>
              <Button variant="ghost" size="icon-xs" onClick={speak} aria-label="Read aloud">
                <Volume2 className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
