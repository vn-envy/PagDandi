#!/usr/bin/env node
/**
 * Humsafar presence relay — the demo transport.
 *
 * Runs on one phone's hotspot (or a laptop) with NO internet: peers join the
 * local Wi-Fi, positions and SOS beacons stream device-to-device over the LAN
 * radio link. Production replaces this with BLE mesh gossip (Meshtastic
 * pattern) — see README "Humsafar transport" for the roadmap and why a browser
 * can't broadcast BLE today.
 *
 * Protocol: every client sends JSON {id, name, lat, lng, ele?, ts, status};
 * the relay fans each message out to every other client. It stores nothing.
 */
import { WebSocketServer } from "ws";

const PORT = process.env.RELAY_PORT ?? 8790;
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  ws.on("message", (data, isBinary) => {
    for (const client of wss.clients) {
      if (client !== ws && client.readyState === 1) client.send(data, { binary: isBinary });
    }
  });
});

console.log(`Humsafar relay listening on ws://0.0.0.0:${PORT} (ephemeral, stores nothing)`);
