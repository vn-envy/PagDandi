import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getConfig, setConfig, type GemmaConfig } from "@/lib/gemma";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function SettingsSheet({ open, onClose, onSaved }: Props) {
  const [cfg, setCfg] = useState<GemmaConfig>(getConfig());
  if (!open) return null;

  function save() {
    setConfig(cfg);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Gemma endpoint</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Point Trail Sathi at your local Gemma E4B runtime — LiteRT-LM{" "}
          <code>serve</code> (preferred) or Ollama, both OpenAI-compatible. Leave
          as-is to use the on-device rule-based fallback when no endpoint is up.
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">Endpoint (OpenAI-compatible base)</span>
            <input
              value={cfg.endpoint}
              onChange={(e) => setCfg({ ...cfg, endpoint: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Model</span>
            <input
              value={cfg.model}
              onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">API key (optional)</span>
            <input
              value={cfg.apiKey ?? ""}
              onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>
    </div>
  );
}
