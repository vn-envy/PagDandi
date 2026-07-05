"use client";

import { useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { SERVER_URL, type TrekManifest } from "@/lib/types";
import { interpolatePosition } from "@/lib/geo";

interface TrailSathiProps {
  manifest: TrekManifest;
  kmAlongTrail: number;
  onKmChange: (km: number) => void;
}

export function TrailSathi({ manifest, kmAlongTrail, onKmChange }: TrailSathiProps) {
  const [question, setQuestion] = useState("Can I make Triund top before sunset?");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backend, setBackend] = useState<string | null>(null);
  const [routedBy, setRoutedBy] = useState<string | null>(null);
  const [almanac, setAlmanac] = useState<{ method: string; titles: string[] } | null>(null);
  const [toolCalls, setToolCalls] = useState<
    Array<{ name: string; args?: unknown; result: unknown }>
  >([]);

  const position = interpolatePosition(manifest, kmAlongTrail);

  async function ask() {
    setLoading(true);
    setReply(null);
    setToolCalls([]);
    setBackend(null);
    setRoutedBy(null);
    setAlmanac(null);
    try {
      // Streaming path: SSE over fetch — tool_call events + live tokens
      const res = await fetch(`${SERVER_URL}/api/guide/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, kmAlongTrail }),
      });
      if (!res.ok || !res.body) throw new Error("stream unavailable");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let gotTokens = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as {
            type: string;
            backend?: string;
            model?: string;
            method?: string;
            titles?: string[];
            name?: string;
            args?: unknown;
            result?: unknown;
            text?: string;
          };
          if (ev.type === "meta" && ev.backend) setBackend(ev.backend);
          if (ev.type === "router" && ev.model) setRoutedBy(ev.model);
          if (ev.type === "rag" && ev.method && ev.titles)
            setAlmanac({ method: ev.method, titles: ev.titles });
          if (ev.type === "tool_call" && ev.name)
            setToolCalls((tc) => [...tc, { name: ev.name!, args: ev.args, result: ev.result }]);
          if (ev.type === "token" && ev.text) {
            gotTokens = true;
            setLoading(false);
            setReply((r) => (r ?? "") + ev.text);
          }
          if (ev.type === "done" && ev.backend) setBackend(ev.backend);
        }
      }
      if (!gotTokens) throw new Error("empty stream");
    } catch {
      // Legacy non-streaming fallback
      try {
        const res = await fetch(`${SERVER_URL}/api/guide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, kmAlongTrail }),
        });
        const data = await res.json();
        setReply(data.reply);
        setBackend(data.backend);
        setToolCalls(data.toolCalls ?? []);
        setAlmanac(data.almanac ?? null);
      } catch {
        setReply("Could not reach Trail Sathi. Is the local server running?");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-muted-foreground" />
          Trail Sathi
          <Badge variant="secondary" className="ml-auto text-[10px]">
            Gemma 4 E4B
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Position-aware guide · tool calling, not RAG
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Demo position along trail</Label>
            <span className="text-xs text-muted-foreground">
              {position.elevationM}m · {kmAlongTrail.toFixed(1)} km
            </span>
          </div>
          <Slider
            value={[kmAlongTrail]}
            min={0}
            max={manifest.trailLengthKm}
            step={0.1}
            onValueChange={(value) => {
              const v = Array.isArray(value) ? value[0] : value;
              if (typeof v === "number") onKmChange(v);
            }}
          />
          <div className="flex flex-wrap gap-1">
            {manifest.demoPositions.map((d) => (
              <Button
                key={d.label}
                variant="outline"
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => onKmChange(d.kmAlongTrail)}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>

        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          className="text-sm"
        />
        <Button onClick={ask} disabled={loading} className="w-full">
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Send className="size-4" /> Ask Trail Sathi
            </>
          )}
        </Button>

        {reply && (
          <div className="flex-1 space-y-2 overflow-auto rounded-lg border bg-muted/30 p-3">
            <p className="text-sm leading-relaxed">{reply}</p>
            {backend && (
              <p className="text-[10px] text-muted-foreground">
                Backend: {backend}
                {routedBy ? ` · routed by ${routedBy}` : ""}
                {almanac ? ` · almanac: ${almanac.titles.join(", ")} (${almanac.method})` : ""}
              </p>
            )}
            {toolCalls.length > 0 && (
              <div className="space-y-1 border-t pt-2">
                <p className="text-[10px] font-medium text-muted-foreground">Tool calls</p>
                {toolCalls.map((tc, i) => (
                  <pre
                    key={i}
                    className="whitespace-pre-wrap break-all rounded bg-background p-1.5 text-[9px]"
                  >
                    {tc.name}({tc.args ? JSON.stringify(tc.args, null, 0) : ""}) →{" "}
                    {JSON.stringify(tc.result, null, 0).slice(0, 120)}…
                  </pre>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
