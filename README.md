# पगडंडी PagDandi — the footpath

**An offline sherpa in your pocket.** Download one **Trek Pack** — a single bundle containing the
map, the trail, and the intelligence for one trek — and everything works in airplane mode:

- **The map** — [mapcn](https://github.com/AnmolSaini16/mapcn) components (MIT, MapLibre GL,
  shadcn-styled, theme-aware) rendering an offline **PMTiles** vector bundle of the trek region,
  with layered POIs: viewpoints, campsites, water sources, shelters, cafés, temples, peaks, and
  exit/SOS points.
- **Trail Sathi** — Gemma E4B as a **position-aware guide**. Not a chatbot and not RAG: it uses
  function calling to hit local tools — `distance_to(place)`, `remaining_ascent()`,
  `sunset_time()`, `nearest(category)`, `current_status()` — and reasons over your GPS position,
  the elevation profile, and the time of day to answer things like *"can I make the summit before
  dark, or should I camp at the meadow?"* Agentic workflow, entirely on-device.
- **Bhasha Bridge** — hold the phone up to a Gaddi shepherd: Gemma's edge models natively accept
  audio and do speech-to-translated-text across 35+ languages, max 30-second clips, fully
  offline. On-device TTS reads the translation aloud.
- **Humsafar** (हमसफ़र, *fellow traveler*) — every nearby trekker is a glowing dot on your map,
  shared **device-to-device over local radio, never through a server**. Long-press SOS and your
  dot turns red on every map in range with bearing, distance, and a Gemma-composed situational
  brief. *The nearest human is almost always faster than the nearest helicopter.*
- **SOS card** — nearest exit point with bearing and distance, nearest shelter, emergency
  numbers, and a shareable last-known-position **plus code**. Strictly navigation and signaling —
  no first-aid or medical content, by design.

The demo Trek Pack is **Triund–Indrahar Pass** (McLeod Ganj, Dhauladhar range): 13 km,
1,870 m → 4,336 m, built from OpenStreetMap + SRTM.

---

## Run it

```bash
npm install
npm run dev          # app on :5173 (LLM proxied from :11434, relay from :8790)
npm run relay        # Humsafar presence relay (optional, for the peer layer)
```

Then load `http://localhost:5173`, turn networking off, and everything keeps working.

### The model

Trail Sathi and Bhasha Bridge talk to a **local** endpoint at `/llm`, proxied to
`http://127.0.0.1:11434` (override with `LLM_ENDPOINT=`). Either runtime works:

```bash
# LiteRT-LM (Google's showcased edge runtime) serving Gemma E4B, or:
ollama serve && ollama pull gemma3n:e4b
```

The UI resolves and displays **which model actually answered** every message. Three honest
tiers, always labeled on screen:

1. **Gemma E4B on-device** — full agentic tool-calling + audio translation.
2. **Pack Brain** — if no model endpoint is reachable, the *same local tools* run
   deterministically with templated prose. Labeled `PACK BRAIN (no model)`. Nothing is faked as
   model output.
3. **`scripts/mock-llm.mjs`** — a development stub speaking the Ollama protocol that exercises
   the full tool-calling loop on machines that can't run inference (like CI). It labels itself
   `mock-sathi`. It is a test rig, not a demo stand-in.

## Trek Pack format

```
public/packs/triund-indrahar/
├── map.pmtiles   # 2.1 MB offline vector map (pmtiles extract of the bbox)
└── pack.json     # trail polyline [lng,lat,ele,cumulative_m] + POIs + exits +
                  # emergency numbers + trek notes — everything Sathi reasons over
```

Rebuild it (or build a new trek) with:

```bash
# 1. offline map — any bbox from Protomaps' free daily planet builds
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles \
  public/packs/<trek>/map.pmtiles --bbox=76.26,32.19,76.48,32.38

# 2. POIs + trail from OpenStreetMap (Overpass; see scripts/overpass-pois.ql)
# 3. stitch trail, bake SRTM elevations, curate POIs, emit pack.json
npm run build-pack
```

Basemap glyphs and sprites are vendored in `public/basemap-assets/` (from
[protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets)) so map labels render
with zero network.

## Humsafar transport — what's real and what's roadmap

**Real today (this repo):** positions and SOS beacons travel over a ~30-line WebSocket relay
(`server/relay.mjs`) on a phone hotspot — a direct local radio link between devices, mobile data
off, no internet, no server in the cloud, nothing stored. Peers fade to labeled "ghosts"
(*last seen 40 min ago*) when stale. Presence is **opt-in** (visible/ghost toggle), ephemeral,
peer-to-peer only.

**Why not Bluetooth mesh in the browser:** Web Bluetooth cannot *advertise* — browsers can
connect to peripherals but cannot broadcast as one, so a web app cannot form a true BLE mesh.

**Production roadmap (native build):** BLE advertising + Meshtastic-pattern gossip, where every
trekker is a data mule — an SOS packet hops phone-to-phone down the mountain until one device
finds network and auto-forwards to 112 and the family contact. **The trail is the network.**

**Demo integrity:** the in-app "demo companions" (for single-device demos) are scripted and
carry a `DEMO` / `SIMULATED` badge everywhere they appear. Same for the position slider
(`SIMULATED POSITION`) — on a real trek it's replaced by `navigator.geolocation` snapped to the
trail.

## Why this exists

Offline maps exist — behind foreign paywalls (AllTrails ~$35.99/yr, Gaia GPS Premium ~₹6,000/yr),
with patchy India coverage; Indiahikes literally tells its trekkers to load GPX files into a US
app. **Offline intelligence — a guide that reasons about your situation and speaks the local
language — exists nowhere, at any price.** Meanwhile the failure pattern in Indian trekking
tragedies is brutally consistent: *lost the way + sudden weather + zero connectivity*
(Sahastratal 2024: 9 dead; Lamkhaga 2021: 11 dead). Where there's no network, there's no Google.

## Stack

| Layer | Tech | License |
|---|---|---|
| UI | React + Vite + Tailwind v4 + shadcn/ui + **mapcn** | MIT |
| Map engine | MapLibre GL + **PMTiles** protocol | BSD/MIT |
| Basemap data | **Protomaps** daily planet builds ← OpenStreetMap | ODbL |
| Trail & POIs | OpenStreetMap via Overpass; SRTM 30 m elevations | ODbL |
| Model | **Gemma E4B** via LiteRT-LM serve (Ollama fallback) | Gemma license |
| Sun math | suncalc | BSD |
| Peer relay | `ws` (demo transport; BLE mesh is the native roadmap) | MIT |

## Development

```bash
npm run build        # type-check + production build
npm run lint         # oxlint
node scripts/mock-llm.mjs                       # protocol-true LLM stub on :11435
LLM_ENDPOINT=http://127.0.0.1:11435 npm run dev # point the app at it
node scripts/smoke.mjs                          # headless end-to-end smoke test
```
