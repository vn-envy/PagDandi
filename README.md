# PagDandi · पगडंडी — the footpath

**An offline sherpa in your pocket.** Download a **Trek Pack** — a single file
with the map, the trail, and the intelligence for one trek — and once it's on
your phone, everything below works in **airplane mode**:

- **The map** — [mapcn](https://github.com/) / MapLibre GL rendering an offline
  **PMTiles** vector bundle of the trek region, with five POI layers:
  viewpoints, campsites, water sources, shelters and exit/SOS points.
- **Trail Sathi** — **Gemma E4B** as a *position-aware guide, not a chatbot*.
  It uses Gemma's **native function calling** to hit local tools —
  `distance_to(poi)`, `remaining_ascent()`, `sunset_time()`, `nearest(water)`,
  `summit_feasibility()` — and reasons over your GPS position, the elevation
  profile and the time of day to answer *"can I make the summit before dark, or
  should I camp at the meadow?"* No retrieval, no RAG — tool-calling over a live
  world model, running entirely on-device.
- **Bhasha Bridge** — hold the phone up to a Gaddi shepherd. Gemma's edge model
  natively accepts **audio** and does **speech-to-translated-text** across 35+
  languages, ≤30-second clips, fully offline.
- **Humsafar** (हमसफ़र — *fellow traveller*) — a glowing, pulsing dot for every
  trekker near you. When someone triggers **SOS**, their dot turns red on every
  phone in radio range, and **Trail Sathi composes a rescue brief**: bearing,
  distance, time-to-reach at your pace, daylight margin, last water source.
  *The nearest human is almost always faster than the nearest helicopter.*
- **SOS card** — nearest exit with bearing + distance, nearest shelter,
  emergency numbers, and a shareable last-known-position code (+ QR).
  Strictly navigation and signalling — **no medical/first-aid content**.

---

## Why this exists

Offline maps exist — but behind **foreign paywalls** (AllTrails ~$35.99/yr,
Gaia GPS Premium ~₹6,000/yr), with patchy India coverage. Indiahikes, India's
biggest trekking company, literally tells its trekkers to download GPX files and
load them into **Gaia — a US app**. The honest claim, and our wedge:

> Offline maps exist behind foreign paywalls. **Offline *intelligence*** — a
> guide that reasons about your situation and speaks the local language — exists
> **nowhere, at any price.**

The failure pattern is brutally consistent: **lost the way + sudden weather +
zero connectivity.** Sahastratal (June 2024, nine dead), Lamkhaga Pass (2021,
eleven dead), Tungnath–Chandrashila (April 2026, ~30 rescued). Where there's no
network, there's no Google.

India's adventure-tourism market hit **$16.7B in 2024**, projected to **$86B by
2033 (17.8% CAGR)**; solo adventure travel grows **18.6%**, and **40.7% of
India's solo travellers are Gen-Z women** — a demographic where GPS safety
features directly drive adoption.

---

## Architecture

```
                 ┌──────────────────────── on device, airplane mode ───────────────────────┐
  Trek Pack ───▶ │  MapLibre + PMTiles  │  Trail Sathi (Gemma E4B)  │  Bhasha Bridge (audio) │
 (one file:      │  offline vector map  │  native function calling  │  speech → translation  │
  map+trail+     │  + 5 POI layers      │  over local world-model   │  35+ langs, ≤30s        │
  intelligence)  └──────────┬───────────┴─────────────┬─────────────┴──────────┬─────────────┘
                            │                          │                        │
                     GPS position              local tools (pure JS)      MediaRecorder
                     (real or simulated)   distance_to / remaining_ascent /
                                           sunset_time / nearest / summit_feasibility
                            │
                 Humsafar presence layer ── device-to-device over local radio ── SOS + rescue brief
```

**Trail Sathi is not a RAG bot.** Gemma calls JavaScript tools
(`src/lib/tools.ts`) that compute over the Trek Pack's geometry, elevation
profile and the *real* astronomical sunset (`suncalc`). Numbers are never
invented. When no local model endpoint is up, the app degrades to an
**on-device deterministic planner that calls the same real tools** — the natural
language is rule-based, but every distance, ascent and time is genuine. This is
labelled in the UI ("On-device fallback") so **demo integrity is never at risk.**

### Gemma runtime

Trail Sathi talks to a **local, OpenAI-compatible** endpoint — **LiteRT-LM
`serve`** (the runtime Google showcases) or **Ollama** as a fallback. Configure
it in the in-app **Settings** sheet (default `http://localhost:11434/v1`, model
`gemma3n:e4b`). Audio translation uses Gemma's multimodal `input_audio` content
part.

```bash
# Ollama fallback
ollama pull gemma3n:e4b
ollama serve                       # exposes http://localhost:11434/v1
```

---

## Humsafar — the honest engineering story

The app's thesis is *no network on the trail* — so how does phone A know where
phone B is? **Not through a server.** The real-world answer (Meshtastic,
Bridgefy) is **device-to-device radio**: phones broadcast position over BLE /
Wi-Fi Direct, and positions **hop** — every trekker is a data mule, carrying an
SOS packet down the mountain until one phone hits network and auto-forwards to
112 and the family contact. **The trail becomes the network.**

**The trap we refuse:** browsers cannot broadcast BLE (Web Bluetooth is
receive/connect only), so a web app cannot do true phone-to-phone Bluetooth mesh
today. We do **not** fake live peers. Instead we build the real thing over a
transport the browser *can* do, and document BLE mesh as the native roadmap:

- **LAN relay** (`server/relay.js`, `npm run relay`) — a ~40-line stateless
  WebSocket relay. Two phones join the **same hotspot with mobile data OFF** — a
  direct local-radio link, zero internet — and positions stream live.
- **Simulator** — a clearly **labelled** simulation of nearby trekkers for
  solo/offline demos. Never presented as live peers.
- **Roadmap** — BLE mesh with Meshtastic-pattern gossip; no hotspot needed.

Peers are ephemeral, opt-in (visible / ghost mode), and never touch a server.
Stale peers fade to **"ghosts"** with a *last seen 40 min ago* label — itself a
real mountain-safety signal.

---

## Trek Pack data pipeline (reproducible)

The default pack is **Triund–Indrahar (McLeod Ganj)**. Regenerate it:

```bash
# 1. Offline basemap: extract the bbox from Protomaps' daily planet build
bash scripts/extract-pmtiles.sh          # -> public/trek-packs/triund.pmtiles

# 2. POIs from OpenStreetMap via Overpass
curl -s -d @scripts/overpass-triund.overpassql \
     https://overpass-api.de/api/interpreter > scripts/triund-pois.osm.json
node scripts/build-pois.mjs > /tmp/pois.json   # hand-curate into the manifest
```

The trail geometry comes from **Indiahikes' free GPX** + OSM. The committed
`public/trek-packs/triund.json` is a curated **illustrative demo pack**; the app
auto-detects `triund.pmtiles` if present and otherwise renders a clean
topographic background so the trail, POIs and live positions still work offline.

> **Data attribution:** Map © OpenStreetMap contributors (ODbL) · vector tiles
> via Protomaps · trail curated from Indiahikes GPX + OSM.

---

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm run relay          # (optional) Humsafar LAN relay on :8787
npm run build          # production build
```

Use the **Position / Clock / Pace** sliders to demo any GPS position, time of
day and walking speed on the trail — you can pitch the whole app from a desk.

## Tech

MIT-friendly, self-hosted, no runtime CDN: React + Vite + TypeScript, Tailwind +
shadcn-style UI, MapLibre GL + PMTiles, `suncalc`, `qrcode`, a `ws` relay, and
**Gemma E4B** via LiteRT-LM / Ollama.

## Scope discipline (no overclaims)

- Navigation & signalling only — **no medical or first-aid advice.**
- No retrieval / RAG — **tool-calling over a live world model.**
- Peer positions are **real** over the LAN relay; the simulator is **labelled**;
  BLE mesh is **documented, not faked.**
