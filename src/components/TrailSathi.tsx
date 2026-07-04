import { useEffect, useRef, useState } from "react";
import { Compass, Send, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useApp } from "@/state/store";
import { askSathi, llmStatus, packBrain, type ChatMessage, type SathiSource, type SathiStep } from "@/lib/gemma";
import type { ToolContext } from "@/lib/tools";
import { cn } from "@/lib/utils";

interface Turn {
  role: "user" | "sathi";
  text: string;
  steps?: SathiStep[];
  source?: SathiSource;
}

const SUGGESTIONS = [
  "Can I make Triund top before sunset, or should I camp at the meadow?",
  "Where is the nearest water?",
  "How much climbing is left to Indrahar Pass?",
  "Weather is turning — where is the nearest shelter?",
];

function StepTrace({ steps }: { steps: SathiStep[] }) {
  const calls = steps.filter((s) => s.kind === "tool_call");
  if (!calls.length) return null;
  return (
    <div className="mt-1.5 space-y-0.5">
      {calls.map((s, i) => (
        <div key={i} className="text-muted-foreground flex items-center gap-1 font-mono text-[10px]">
          <Wrench className="size-2.5 shrink-0" />
          {s.text}
        </div>
      ))}
    </div>
  );
}

export function TrailSathi() {
  const pack = useApp((s) => s.pack);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelUp, setModelUp] = useState<boolean | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    llmStatus().then((s) => {
      setModelUp(s.up);
      setModelName(s.model);
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const ask = async (question: string) => {
    if (!pack || busy || !question.trim()) return;
    setInput("");
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text: question }]);

    const s = useApp.getState();
    const ctx: ToolContext = { pack, position: s.position(), now: s.now() };
    const history: ChatMessage[] = turns.flatMap((t) => [
      { role: t.role === "user" ? ("user" as const) : ("assistant" as const), content: t.text },
    ]);

    try {
      let reply;
      if (modelUp) {
        try {
          reply = await askSathi(question, ctx, history);
        } catch {
          reply = packBrain(question, ctx);
        }
      } else {
        reply = packBrain(question, ctx);
      }
      setTurns((t) => [...t, { role: "sathi", text: reply.answer, steps: reply.steps, source: reply.source }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Compass className="size-4 text-orange-500" />
        <div className="flex-1">
          <div className="text-sm font-semibold leading-none">Trail Sathi</div>
          <div className="text-muted-foreground mt-0.5 text-[11px]">
            Position-aware guide · tools over a live world model · fully offline
          </div>
        </div>
        <Badge variant={modelUp ? "default" : "secondary"} className="text-[9px] uppercase">
          {modelUp === null ? "…" : modelUp ? `${modelName ?? "model"} · on-device` : "PACK BRAIN (no model)"}
        </Badge>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div ref={scrollRef} className="space-y-3 overflow-y-auto p-4">
          {turns.length === 0 && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                Ask about your situation — Sathi reasons over your GPS position, the elevation profile
                and the time of day by calling local tools. Try:
              </p>
              {SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  className="bg-muted hover:bg-accent block w-full rounded-lg px-3 py-2 text-left text-xs transition-colors"
                  onClick={() => ask(sug)}
                >
                  {sug}
                </button>
              ))}
            </div>
          )}
          {turns.map((turn, i) => (
            <div key={i} className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                  turn.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {turn.text}
                {turn.role === "sathi" && (
                  <>
                    {turn.steps && <StepTrace steps={turn.steps} />}
                    <div className="text-muted-foreground mt-1 flex items-center gap-1 text-[9px] uppercase tracking-wide">
                      <Sparkles className="size-2.5" />
                      {turn.source === "gemma"
                        ? `${modelName ?? "local model"}, on-device`
                        : "Pack Brain (deterministic tools, no model)"}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span className="bg-muted-foreground/60 size-1.5 animate-pulse rounded-full" />
              Sathi is checking the trail…
            </div>
          )}
        </div>
      </ScrollArea>

      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
          placeholder="Ask about distance, water, daylight, shelter…"
          className="max-h-24 min-h-9 flex-1 resize-none text-sm"
          rows={1}
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
