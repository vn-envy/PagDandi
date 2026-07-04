import { useState } from "react";
import { Compass, Loader2, Send, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { runAgent, type AgentAnswer } from "@/lib/gemma";
import type { WorldState } from "@/lib/tools";

const SUGGESTIONS = [
  "Can I make Triund Top before sunset, or should I camp?",
  "Where's the nearest water?",
  "Nearest shelter if a storm hits?",
  "Can I reach Indrahar Pass in time today?",
];

interface Props {
  world: WorldState | null;
  online: boolean;
}

export function TrailSathiPanel({ world, online }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    if (!world || !q.trim()) return;
    setLoading(true);
    setError(null);
    setInput(q);
    try {
      const res = await runAgent(world, q);
      setAnswer(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Compass className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Trail Sathi</span>
        <Badge variant={online ? "default" : "muted"} className="ml-auto">
          {online ? "Gemma E4B live" : "On-device fallback"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        A position-aware guide, not a chatbot. It calls local tools over your GPS,
        the elevation profile and the real sunset time.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => ask(s)}
            disabled={loading}
            className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[11px] text-secondary-foreground transition hover:bg-secondary disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(input)}
          placeholder="Ask about your situation…"
          className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Button size="icon" onClick={() => ask(input)} disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{error}</div>
      )}

      {answer && (
        <div className="rounded-xl border border-border bg-secondary/40 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {answer.online ? "Gemma reasoned" : "On-device (rule-based) reasoning"}
            </span>
          </div>
          <p className="text-sm leading-relaxed">{answer.text}</p>

          {answer.steps.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-border pt-2">
              <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Wrench className="h-3 w-3" /> Tool calls
              </div>
              {answer.steps.map((s, i) => (
                <div key={i} className="text-[11px] text-muted-foreground">
                  <code className="rounded bg-background px-1 py-0.5 text-[10px] text-foreground">
                    {s.tool}({Object.values(s.args).filter(Boolean).join(", ")})
                  </code>{" "}
                  → {s.result.summary}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
