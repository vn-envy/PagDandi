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

  // Position lives in a ref so sendPosition stays referentially stable —
  // otherwise every slider tick re-runs the socket effect, tearing down and
  // reopening the WebSocket, and a send() can land while the new socket is
  // still CONNECTING (an uncaught DOMException that takes down the React tree).
  const positionRef = useRef(position);
  positionRef.current = position;
  const peerNameRef = useRef(peerName);
  peerNameRef.current = peerName;

  const sendPosition = useCallback(
    (status: "ok" | "sos" = "ok", visible = true) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: "position",
          lat: positionRef.current.lat,
          lng: positionRef.current.lng,
          status,
          visible,
          name: peerNameRef.current,
        }),
      );
    },
    [],
  );

  const triggerSos = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "sos" }));
    }
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

  // Push a fresh position when it changes (no socket teardown — see refs above).
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
