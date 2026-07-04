import { create } from "zustand";
import type { TrekPack } from "@/lib/trekpack";
import { positionAt, type TrailPosition } from "@/lib/trekpack";

export type PeerStatus = "ok" | "sos";

export interface Peer {
  id: string;
  name: string;
  lat: number;
  lng: number;
  ele?: number;
  ts: number; // epoch ms of last update
  status: PeerStatus;
  /** true for locally-scripted demo companions (always labeled in the UI) */
  simulated?: boolean;
}

export type Panel = "sathi" | "bhasha" | "sos" | null;

interface AppState {
  pack: TrekPack | null;
  setPack: (p: TrekPack) => void;

  /** simulated GPS: meters walked from the trailhead */
  distM: number;
  setDistM: (d: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;

  /** simulated clock offset in minutes (lets the demo show "late afternoon") */
  clockOffsetMin: number;
  setClockOffsetMin: (m: number) => void;

  theme: "light" | "dark";
  toggleTheme: () => void;

  panel: Panel;
  setPanel: (p: Panel) => void;

  // Humsafar
  selfId: string;
  selfName: string;
  visible: boolean; // visible vs ghost mode (opt-in presence sharing)
  setVisible: (v: boolean) => void;
  peers: Record<string, Peer>;
  upsertPeer: (p: Peer) => void;
  removePeer: (id: string) => void;
  relayConnected: boolean;
  setRelayConnected: (c: boolean) => void;
  simulatePeers: boolean;
  setSimulatePeers: (s: boolean) => void;

  selfSos: boolean;
  setSelfSos: (s: boolean) => void;

  position: () => TrailPosition;
  now: () => Date;
}

const NAMES = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Zoya", "Ishan", "Tara"];

export const useApp = create<AppState>((set, get) => ({
  pack: null,
  setPack: (pack) => set({ pack }),

  distM: 5200,
  setDistM: (distM) => set({ distM }),
  playing: false,
  setPlaying: (playing) => set({ playing }),

  clockOffsetMin: 0,
  setClockOffsetMin: (clockOffsetMin) => set({ clockOffsetMin }),

  theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

  panel: null,
  setPanel: (panel) => set({ panel }),

  selfId: crypto.randomUUID().slice(0, 8),
  selfName: NAMES[Math.floor(Math.random() * NAMES.length)],
  visible: true,
  setVisible: (visible) => set({ visible }),
  peers: {},
  upsertPeer: (p) => set((s) => ({ peers: { ...s.peers, [p.id]: p } })),
  removePeer: (id) =>
    set((s) => {
      const peers = { ...s.peers };
      delete peers[id];
      return { peers };
    }),
  relayConnected: false,
  setRelayConnected: (relayConnected) => set({ relayConnected }),
  simulatePeers: false,
  setSimulatePeers: (simulatePeers) => set({ simulatePeers }),

  selfSos: false,
  setSelfSos: (selfSos) => set({ selfSos }),

  position: () => {
    const { pack, distM } = get();
    if (!pack) return { lng: 76.3259, lat: 32.2546, ele: 2130, distM: 0 };
    return positionAt(pack, distM);
  },
  now: () => new Date(Date.now() + get().clockOffsetMin * 60000),
}));
