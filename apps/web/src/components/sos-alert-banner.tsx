"use client";

import { useEffect, useState } from "react";
import { Navigation, Siren, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SERVER_URL, type PeerState, type Position, type SosBrief } from "@/lib/types";
import { haversineKm } from "@/lib/geo";

interface SosAlertBannerProps {
  sosPeer: PeerState;
  position: Position;
  kmAlongTrail: number;
  onDismiss: () => void;
}

function bearingLabel(lat1: number, lng1: number, lat2: number, lng2: number): string {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

export function SosAlertBanner({
  sosPeer,
  position,
  kmAlongTrail,
  onDismiss,
}: SosAlertBannerProps) {
  const [brief, setBrief] = useState<SosBrief | null>(null);
  const [briefBackend, setBriefBackend] = useState<string | null>(null);

  const distanceKm = haversineKm(position.lat, position.lng, sosPeer.lat, sosPeer.lng);
  const bearing = bearingLabel(position.lat, position.lng, sosPeer.lat, sosPeer.lng);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/sos/brief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kmAlongTrail,
        sosPeer: { name: sosPeer.name, lat: sosPeer.lat, lng: sosPeer.lng },
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        setBrief(d.sosBrief ?? null);
        setBriefBackend(d.briefBackend ?? null);
      })
      .catch(() => null);
  }, [kmAlongTrail, sosPeer]);

  return (
    <div className="fixed inset-x-0 top-0 z-50 border-b-2 border-red-600 bg-red-950/95 p-4 text-red-50 shadow-2xl backdrop-blur animate-in slide-in-from-top duration-300">
      <div className="mx-auto flex max-w-4xl items-start gap-3">
        <div className="relative mt-0.5 flex size-10 shrink-0 items-center justify-center">
          <span className="absolute size-10 animate-ping rounded-full bg-red-500 opacity-50" />
          <span className="relative flex size-8 items-center justify-center rounded-full bg-red-600">
            <Siren className="size-4" />
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-bold tracking-wide">
            SOS — {sosPeer.name}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-red-200">
            <Navigation className="size-3.5" />
            {distanceKm.toFixed(1)} km {bearing} of you
          </p>
          {brief ? (
            <div className="space-y-1.5 rounded-md bg-red-900/60 p-2 text-sm leading-relaxed">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold">
                <span>ETA ~{brief.etaMin} min</span>
                <span className="font-normal text-red-200">
                  {brief.distanceKm.toFixed(1)} km {brief.bearing} · on foot
                </span>
              </p>
              {brief.hazards.length > 0 && (
                <p className="text-xs text-red-200">{brief.hazards.join(" · ")}</p>
              )}
              <p>{brief.advice}</p>
              <p className="text-[10px] text-red-300/70">
                {briefBackend === "simulator"
                  ? "tool-computed fallback — connect Gemma for live brief"
                  : "Gemma 4 E4B · thinking mode · schema-constrained"}
              </p>
            </div>
          ) : (
            <p className="text-xs text-red-300/70 animate-pulse">
              Trail Sathi composing rescue brief…
            </p>
          )}
          <p className="text-[10px] text-red-300/60">
            The nearest human is almost always faster than the nearest helicopter.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDismiss}
          className="shrink-0 text-red-200 hover:bg-red-900 hover:text-red-50"
          aria-label="Dismiss SOS alert"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
