"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Copy, Phone, Share2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SERVER_URL, type PeerState } from "@/lib/types";

interface SosCardProps {
  kmAlongTrail: number;
  sosPeer?: PeerState | null;
}

export function SosCard({ kmAlongTrail, sosPeer }: SosCardProps) {
  const [data, setData] = useState<{
    nearestExit: { poi: { name: string }; distanceKm: number; bearingLabel: string };
    nearestShelter: { poi: { name: string }; distanceKm: number; bearingLabel: string };
    emergency: Record<string, string>;
    lastKnownPositionCode: string;
    gemmaBrief?: string | null;
  } | null>(null);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/sos/brief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kmAlongTrail,
        sosPeer: sosPeer
          ? { name: sosPeer.name, lat: sosPeer.lat, lng: sosPeer.lng }
          : undefined,
      }),
    })
      .then((r) => r.json())
      .then(setData)
      .catch(() => null);
  }, [kmAlongTrail, sosPeer]);

  if (!data) return null;

  return (
    <Card className="border-red-500/40 bg-red-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-400">
          <AlertTriangle className="size-4" />
          SOS Card
          <Badge variant="destructive" className="ml-auto text-[10px]">
            Nav only
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Signaling & navigation — no medical advice
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {data.gemmaBrief && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs leading-relaxed">
            {data.gemmaBrief}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Nearest exit</p>
            <p className="font-medium">{data.nearestExit.poi.name}</p>
            <p>
              {data.nearestExit.distanceKm.toFixed(1)} km {data.nearestExit.bearingLabel}
            </p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Nearest shelter</p>
            <p className="font-medium">{data.nearestShelter.poi.name}</p>
            <p>
              {data.nearestShelter.distanceKm.toFixed(1)} km {data.nearestShelter.bearingLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.emergency).map(([k, v]) => (
            <a
              key={k}
              href={`tel:${v.replace(/[^0-9+]/g, "")}`}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs hover:bg-muted"
            >
              <Phone className="size-3" />
              {k.replace(/_/g, " ")}: {v}
            </a>
          ))}
        </div>
        <div className="flex items-center justify-between rounded border bg-background p-2">
          <div>
            <p className="text-[10px] text-muted-foreground">Last known position</p>
            <p className="font-mono text-xs">{data.lastKnownPositionCode}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard?.writeText(data.lastKnownPositionCode)}
          >
            <Copy className="size-3" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: "PagDandi SOS",
                text: `LKP: ${data.lastKnownPositionCode} — Triund trail`,
              });
            }
          }}
        >
          <Share2 className="size-3" /> Share position code
        </Button>
      </CardContent>
    </Card>
  );
}
