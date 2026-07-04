import { useEffect, useRef } from "react";
import { useApp, type Peer } from "@/state/store";
import { positionAt } from "@/lib/trekpack";

/** How long before a peer dot fades to a "ghost" (last-seen label). */
export const STALE_MS = 5 * 60 * 1000;
/** Drop peers not heard from in this long. */
const DROP_MS = 60 * 60 * 1000;
const SEND_EVERY_MS = 2000;

function relayUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/relay`;
}

/**
 * Humsafar: presence over the local-radio relay. Connects opportunistically;
 * when no relay is reachable the layer simply stays empty (or shows the
 * clearly-labeled demo companions).
 */
export function useHumsafar() {
  const wsRef = useRef<WebSocket | null>(null);

  // -- relay connection ------------------------------------------------
  useEffect(() => {
    let alive = true;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (!alive) return;
      try {
        const ws = new WebSocket(relayUrl());
        wsRef.current = ws;
        ws.onopen = () => useApp.getState().setRelayConnected(true);
        ws.onmessage = (e) => {
          try {
            const p = JSON.parse(e.data) as Peer;
            if (p.id && p.id !== useApp.getState().selfId && typeof p.lat === "number") {
              useApp.getState().upsertPeer({ ...p, ts: Date.now() });
            }
          } catch {
            // ignore malformed frames
          }
        };
        ws.onclose = () => {
          useApp.getState().setRelayConnected(false);
          retryTimer = setTimeout(connect, 5000);
        };
        ws.onerror = () => ws.close();
      } catch {
        retryTimer = setTimeout(connect, 5000);
      }
    };
    connect();
    return () => {
      alive = false;
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, []);

  // -- broadcast own position -------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      const s = useApp.getState();
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !s.visible) return;
      const pos = s.position();
      ws.send(
        JSON.stringify({
          id: s.selfId,
          name: s.selfName,
          lat: pos.lat,
          lng: pos.lng,
          ele: Math.round(pos.ele),
          ts: Date.now(),
          status: s.selfSos ? "sos" : "ok",
        } satisfies Peer),
      );
    }, SEND_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  // -- expire dead peers --------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      const s = useApp.getState();
      const now = Date.now();
      for (const p of Object.values(s.peers)) {
        if (!p.simulated && now - p.ts > DROP_MS) s.removePeer(p.id);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, []);
}

/**
 * Demo companions: two scripted trekkers moving along the trail, one of whom
 * can trigger an SOS. Every dot they produce carries `simulated: true` and is
 * rendered with a "DEMO" badge — never presented as live people.
 */
export function useDemoPeers() {
  const simulatePeers = useApp((s) => s.simulatePeers);

  useEffect(() => {
    if (!simulatePeers) {
      useApp.getState().removePeer("demo-1");
      useApp.getState().removePeer("demo-2");
      return;
    }
    const t0 = Date.now();
    const timer = setInterval(() => {
      const s = useApp.getState();
      if (!s.pack) return;
      const elapsed = (Date.now() - t0) / 1000;
      // Lobsang descends from Snowline toward you; Priya climbs behind you.
      const d1 = Math.max(0, Math.min(s.pack.stats.lengthM, s.distM + 900 - elapsed * 12));
      const d2 = Math.max(0, s.distM - 1400 + elapsed * 10);
      const p1 = positionAt(s.pack, d1);
      const p2 = positionAt(s.pack, d2);
      s.upsertPeer({ id: "demo-1", name: "Lobsang", lat: p1.lat, lng: p1.lng, ele: Math.round(p1.ele), ts: Date.now(), status: s.peers["demo-1"]?.status ?? "ok", simulated: true });
      s.upsertPeer({ id: "demo-2", name: "Priya", lat: p2.lat, lng: p2.lng, ele: Math.round(p2.ele), ts: Date.now(), status: "ok", simulated: true });
    }, 1500);
    return () => clearInterval(timer);
  }, [simulatePeers]);
}
