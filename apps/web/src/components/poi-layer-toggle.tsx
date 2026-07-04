"use client";

import { POI_COLORS, POI_LABELS, type PoiType } from "@/lib/types";
import { cn } from "@/lib/utils";

const POI_TYPES: PoiType[] = ["viewpoint", "campsite", "water", "shelter", "exit", "sos"];

interface PoiLayerToggleProps {
  layers: Record<string, boolean>;
  onToggle: (type: PoiType) => void;
}

export function PoiLayerToggle({ layers, onToggle }: PoiLayerToggleProps) {
  return (
    <div className="pointer-events-auto flex flex-wrap gap-1.5">
      {POI_TYPES.map((type) => {
        const active = layers[type] !== false;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onToggle(type)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm transition-all",
              active
                ? "border-transparent bg-background/85 text-foreground shadow-sm"
                : "border-border/50 bg-background/40 text-muted-foreground/60 line-through",
            )}
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: active ? POI_COLORS[type] : "#9ca3af" }}
            />
            {POI_LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}
