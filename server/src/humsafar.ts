import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";

export interface PeerState {
  id: string;
  name: string;
  lat: number;
  lng: number;
  timestamp: number;
  status: "ok" | "sos";
  visible: boolean;
}

interface ClientMeta {
  room: string;
  peer: PeerState;
}

const STALE_MS = 40 * 60 * 1000; // 40 minutes — ghost peers

export function attachHumsafar(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/humsafar" });
  const rooms = new Map<string, Map<WebSocket, ClientMeta>>();

  function broadcast(room: string, exclude?: WebSocket) {
    const clients = rooms.get(room);
    if (!clients) return;

    const peers: PeerState[] = [];
    const now = Date.now();
    for (const [ws, meta] of clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (!meta.peer.visible) continue;
      peers.push({
        ...meta.peer,
        // Mark stale peers as ghosts (client renders faded)
        timestamp: meta.peer.timestamp,
      });
    }

    const payload = JSON.stringify({ type: "peers", peers, serverTime: now, staleMs: STALE_MS });
    for (const [ws] of clients) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const room = url.searchParams.get("room") ?? "triund";
    const name = url.searchParams.get("name") ?? `Trekker-${Math.random().toString(36).slice(2, 6)}`;
    const id = url.searchParams.get("id") ?? crypto.randomUUID();

    if (!rooms.has(room)) rooms.set(room, new Map());
    const clients = rooms.get(room)!;

    const meta: ClientMeta = {
      room,
      peer: {
        id,
        name,
        lat: 32.2196,
        lng: 76.3234,
        timestamp: Date.now(),
        status: "ok",
        visible: true,
      },
    };
    clients.set(ws, meta);

    ws.send(
      JSON.stringify({
        type: "welcome",
        id,
        room,
        message: "Humsafar: peer-to-peer over local radio. Production uses BLE mesh (Meshtastic-pattern).",
      }),
    );
    broadcast(room);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          lat?: number;
          lng?: number;
          status?: "ok" | "sos";
          visible?: boolean;
          name?: string;
        };

        if (msg.type === "position" && typeof msg.lat === "number" && typeof msg.lng === "number") {
          meta.peer.lat = msg.lat;
          meta.peer.lng = msg.lng;
          meta.peer.timestamp = Date.now();
          if (msg.status) meta.peer.status = msg.status;
          if (typeof msg.visible === "boolean") meta.peer.visible = msg.visible;
          if (msg.name) meta.peer.name = msg.name;
          broadcast(room);
        }

        if (msg.type === "sos") {
          meta.peer.status = "sos";
          meta.peer.timestamp = Date.now();
          broadcast(room);
          const sosPayload = JSON.stringify({
            type: "sos_alert",
            peer: meta.peer,
          });
          for (const [otherWs] of clients) {
            if (otherWs.readyState === WebSocket.OPEN) otherWs.send(sosPayload);
          }
        }

        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", serverTime: Date.now() }));
        }
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      if (!clients.size) rooms.delete(room);
      else broadcast(room);
    });
  });

  return wss;
}
