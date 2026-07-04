/**
 * Humsafar LAN relay — the honest offline transport.
 *
 * This is a ~40-line WebSocket relay you run next to your LiteRT-LM server.
 * Two (or more) phones join the SAME Wi-Fi hotspot with mobile data OFF and
 * point PagDandi at ws://<host>:8787. Positions then stream device-to-device
 * over local radio with ZERO internet — no cloud, no tracking, ephemeral.
 *
 * Production replaces this with a BLE mesh (Meshtastic-pattern gossip) so no
 * hotspot is needed at all; see README. This relay simply forwards each peer
 * message to every OTHER connected client. It stores nothing.
 *
 * Run: `npm run relay`  (optional env: PORT, HOST)
 */
import { WebSocketServer } from "ws";
import os from "node:os";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";

const wss = new WebSocketServer({ port: PORT, host: HOST });

function broadcast(sender, data) {
  for (const client of wss.clients) {
    if (client !== sender && client.readyState === 1) {
      client.send(data);
    }
  }
}

wss.on("connection", (socket) => {
  socket.on("message", (data) => {
    // Forward raw; the relay is deliberately dumb and stateless.
    broadcast(socket, data.toString());
  });
  socket.on("error", () => {});
});

function lanIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

console.log(`\nHumsafar LAN relay listening on ws://${HOST}:${PORT}`);
for (const ip of lanIps()) {
  console.log(`  Phones on the hotspot connect to:  ws://${ip}:${PORT}`);
}
console.log("Turn mobile data OFF. No internet is used.\n");
