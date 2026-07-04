"use client";

import { useId } from "react";
import { Users, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface HumsafarPanelProps {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  connected: boolean;
  peerCount: number;
  onTriggerSos: () => void;
  visible: boolean;
  onVisibleChange: (v: boolean) => void;
}

export function HumsafarPanel({
  enabled,
  onEnabledChange,
  connected,
  peerCount,
  onTriggerSos,
  visible,
  onVisibleChange,
}: HumsafarPanelProps) {
  const id = useId();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-emerald-400" />
          Humsafar
          <Badge variant="outline" className="ml-auto gap-1 text-[10px]">
            {connected ? (
              <>
                <Wifi className="size-3" /> LAN relay
              </>
            ) : (
              <>
                <WifiOff className="size-3" /> offline mesh
              </>
            )}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Peer positions over local radio · production: BLE mesh (Meshtastic-pattern)
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor={`${id}-enable`} className="text-xs">
            Share my position
          </Label>
          <Switch id={`${id}-enable`} checked={enabled} onCheckedChange={onEnabledChange} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor={`${id}-visible`} className="text-xs">
            Visible (not ghost mode)
          </Label>
          <Switch id={`${id}-visible`} checked={visible} onCheckedChange={onVisibleChange} />
        </div>
        <p className="text-xs text-muted-foreground">
          {peerCount} fellow trekker{peerCount !== 1 ? "s" : ""} on map
          {connected ? " · relay connected" : " · waiting for peer"}
        </p>
        <Button
          variant="destructive"
          className="w-full"
          onPointerDown={(e) => {
            e.preventDefault();
            const timer = setTimeout(() => onTriggerSos(), 800);
            const up = () => {
              clearTimeout(timer);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointerup", up);
          }}
        >
          Long-press SOS beacon
        </Button>
      </CardContent>
    </Card>
  );
}
