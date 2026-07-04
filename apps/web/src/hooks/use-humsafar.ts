"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PeerState } from "@/lib/types";
import { WS_URL } from "@/lib/types";

const STALE_MS = 40 * 60 * 1000;

export function useHumsafar(
  peerId: string,
  peerName: string,
  position: { lat: number; lng: number },
  enabled: boolean,
) {
  const [peers, setPeers] = useState<PeerState[]>([]);
  const [connected, setConnected] = useState(false);
  const [sosAlert, setSosAlert] = useState<PeerState | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const sendPosition = useCallback(
    (status: "ok" | "sos" = "ok", visible = true) => {
      wsRef.current?.send(
        JSON.stringify({
          type: "position",
          lat: position.lat,
          lng: position.lng,
          status,
          visible,
          name: peerName,
        }),
      );
    },
    [position.lat, position.lng, peerName],
  );

  const triggerSos = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "sos" }));
    sendPosition("sos");
  }, [sendPosition]);

  useEffect(() => {
    if (!enabled) {
      wsRef.current?.close();
      setConnected(false);
      return;
    }

    const url = `${WS_URL}?room=triund&id=${encodeURIComponent(peerId)}&name=${encodeURIComponent(peerName)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      sendPosition();
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as {
        type: string;
        peers?: PeerState[];
        peer?: PeerState;
      };
      if (msg.type === "peers" && msg.peers) {
        setPeers(msg.peers.filter((p) => p.id !== peerId));
      }
      if (msg.type === "sos_alert" && msg.peer && msg.peer.id !== peerId) {
        setSosAlert(msg.peer);
      }
    };

    ws.onclose = () => setConnected(false);

    const interval = setInterval(() => sendPosition(), 5000);

    return () => {
      clearInterval(interval);
      ws.close();
    };
  }, [enabled, peerId, peerName, sendPosition]);

  useEffect(() => {
    if (connected) sendPosition();
  }, [connected, position.lat, position.lng, sendPosition]);

  return {
    peers,
    connected,
    sosAlert,
    clearSosAlert: () => setSosAlert(null),
    triggerSos,
    staleMs: STALE_MS,
  };
}
