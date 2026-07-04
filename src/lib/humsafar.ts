import type { LngLat } from "./geo";

/**
 * Humsafar (\u0939\u092e\u0938\u092b\u0930 \u2014 "fellow traveller"): the presence + SOS layer.
 *
 * The honest engineering story: a web app cannot broadcast BLE, so it cannot do
 * true phone-to-phone Bluetooth mesh in the browser. What it CAN do is share
 * positions over a transport the browser supports. We implement a tiny local
 * WebSocket relay that two phones reach over a shared hotspot with mobile data
 * OFF — a direct local-radio link, no internet, no cloud server.
 *
 * Production roadmap (documented, not faked): BLE mesh with Meshtastic-pattern
 * gossip, where every phone is a data mule that carries an SOS packet down the
 * mountain until one hits network and auto-forwards to 112 + family.
 *
 * The "simulator" transport below is ALWAYS clearly labelled in the UI as a
 * simulation so demo integrity is never at risk.
 */

export type PeerStatus = "ok" | "sos";

export interface Peer {
  id: string;
  name: string;
  coord: LngLat;
  status: PeerStatus;
  /** Epoch ms of last update. Used to fade stale peers to "ghosts". */
  timestamp: number;
}

export const GHOST_AFTER_MS = 5 * 60 * 1000; // 5 min -> "ghost / last seen"
export const DROP_AFTER_MS = 60 * 60 * 1000; // 60 min -> removed

export function isGhost(peer: Peer, now = Date.now()): boolean {
  return now - peer.timestamp > GHOST_AFTER_MS;
}

export type TransportKind = "lan" | "simulator" | "off";

export interface HumsafarEvents {
  onPeers: (peers: Peer[]) => void;
  onTransport: (kind: TransportKind, connected: boolean) => void;
}

interface WirePeerMsg {
  type: "peer" | "bye";
  peer: Peer;
}

/**
 * Manages the local peer table and a transport. If a LAN relay URL is given and
 * reachable it uses the real WebSocket transport; otherwise it can run a
 * labelled simulator so the map still demos glowing peers offline.
 */
export class Humsafar {
  private peers = new Map<string, Peer>();
  private ws?: WebSocket;
  private simTimer?: number;
  private sweepTimer?: number;
  private self: Peer;
  private kind: TransportKind = "off";
  private trail: LngLat[] = [];

  constructor(
    self: { id: string; name: string; coord: LngLat },
    private events: HumsafarEvents
  ) {
    this.self = { ...self, status: "ok", timestamp: Date.now() };
    this.sweepTimer = window.setInterval(() => this.sweep(), 10_000);
  }

  getTransport(): TransportKind {
    return this.kind;
  }

  private emit() {
    this.events.onPeers([...this.peers.values()]);
  }

  private sweep() {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) {
      if (now - p.timestamp > DROP_AFTER_MS) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit();
    else this.emit(); // re-emit so ghost styling refreshes
  }

  updateSelf(coord: LngLat, status?: PeerStatus) {
    this.self = {
      ...this.self,
      coord,
      status: status ?? this.self.status,
      timestamp: Date.now(),
    };
    this.broadcast();
  }

  setSelfStatus(status: PeerStatus) {
    this.self = { ...this.self, status, timestamp: Date.now() };
    this.broadcast();
  }

  getSelf(): Peer {
    return this.self;
  }

  private broadcast() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "peer", peer: this.self }));
    }
  }

  /** Connect the LAN WebSocket relay transport. */
  connectLan(url: string) {
    this.disconnect();
    try {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        this.kind = "lan";
        this.events.onTransport("lan", true);
        this.broadcast();
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WirePeerMsg;
          if (msg.peer.id === this.self.id) return;
          if (msg.type === "bye") this.peers.delete(msg.peer.id);
          else this.peers.set(msg.peer.id, msg.peer);
          this.emit();
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (this.kind === "lan") {
          this.kind = "off";
          this.events.onTransport("lan", false);
        }
      };
      ws.onerror = () => {
        this.events.onTransport("lan", false);
      };
    } catch {
      this.events.onTransport("lan", false);
    }
  }

  /**
   * Start the LABELLED simulator: a couple of synthetic trekkers drift along
   * the trail. This is explicitly a simulation for offline demos, never
   * presented as live peers.
   */
  startSimulator(trail: LngLat[]) {
    this.disconnect();
    this.trail = trail;
    this.kind = "simulator";
    this.events.onTransport("simulator", true);

    const mk = (id: string, name: string, frac: number, status: PeerStatus): Peer => {
      const idx = Math.floor(frac * (trail.length - 1));
      return {
        id,
        name,
        coord: trail[idx],
        status,
        timestamp: Date.now(),
      };
    };
    this.peers.set("sim-1", mk("sim-1", "Meera (sim)", 0.62, "ok"));
    this.peers.set("sim-2", mk("sim-2", "Jonas (sim)", 0.78, "ok"));
    this.peers.set("sim-3", mk("sim-3", "Tenzin (sim)", 0.35, "ok"));
    this.emit();

    let t = 0;
    this.simTimer = window.setInterval(() => {
      t += 0.01;
      for (const [id, p] of this.peers) {
        if (!id.startsWith("sim")) continue;
        const base = id === "sim-1" ? 0.62 : id === "sim-2" ? 0.78 : 0.35;
        const frac = Math.min(0.98, Math.max(0.02, base + Math.sin(t + base * 6) * 0.03));
        const idx = Math.floor(frac * (this.trail.length - 1));
        this.peers.set(id, { ...p, coord: this.trail[idx], timestamp: Date.now() });
      }
      this.emit();
    }, 2000);
  }

  /** Trigger a simulated peer's SOS (for the demo second-phone moment). */
  triggerSimSos(id = "sim-2") {
    const p = this.peers.get(id);
    if (p) {
      this.peers.set(id, { ...p, status: "sos", timestamp: Date.now() });
      this.emit();
    }
  }

  disconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = undefined;
    }
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = undefined;
    }
    this.kind = "off";
    this.events.onTransport("off", false);
  }

  destroy() {
    this.disconnect();
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }
}
