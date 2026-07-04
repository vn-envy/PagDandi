# PagDandi (पगडंडी — "the footpath")

An offline sherpa in your pocket for Himalayan trekking. Download a **Trek Pack** — one file bundle with map, trail, and intelligence — and everything works in airplane mode.

Built for **Gemma 4 E4B** on-device: Trail Sathi (tool-calling guide), Bhasha Bridge (speech translation), and Humsafar (peer safety network).

## Trek: Triund–Indrahar (McLeod Ganj)

Default demo trek — dense OSM data, foreign-backpacker crowd, perfect for translation demos.

## Features

| Feature | What it does |
|---------|----------------|
| **Offline map** | PMTiles vector basemap (Protomaps/OSM) via mapcn + MapLibre GL |
| **Trail Sathi** | Gemma 4 E4B calls local tools: `distance_to`, `nearest`, `remaining_ascent`, `sunset_time` |
| **Bhasha Bridge** | 30s audio clips → Gemma AST → Hindi/English (35+ languages on-device) |
| **SOS card** | Nearest exit/shelter, emergency numbers, shareable LKP code — navigation only |
| **Humsafar** | Glowing peer dots via LAN WebSocket relay; production roadmap: BLE mesh |

## Quick start

```bash
# Install dependencies (monorepo)
npm install

# Terminal 1 — API + Humsafar relay
npm run dev:server

# Terminal 2 — Web app
npm run dev:web
```

Open [http://localhost:3000](http://localhost:3000). Drag the position slider, ask Trail Sathi, try Bhasha Bridge.

### Connect real Gemma 4 E4B

```bash
# Option A: LiteRT-LM (Google's stack)
litert-lm run --from-huggingface-repo=litert-community/gemma-4-E4B-it-litert-lm gemma-4-E4B-it.litertlm --backend=gpu
litert-lm serve gemma-4-E4B-it.litertlm --port 8080
export LITERT_URL=http://127.0.0.1:8080/v1

# Option B: Ollama fallback
ollama pull gemma4:4b
export OLLAMA_URL=http://127.0.0.1:11434
```

Without Gemma running, the server uses an honest **simulator** that executes the same trek tools — labeled in the UI.

## Trek Pack structure

```
trek-packs/triund/
  manifest.json    # Waypoints, elevations, emergency numbers
  trail.geojson    # GPX trail line
  pois.geojson     # Viewpoints, camps, water, shelters, exits
  triund.pmtiles   # Offline vector map (~1.5 MB for demo bbox)
```

### Extract PMTiles (Triund bbox)

```bash
chmod +x scripts/extract-triund-pmtiles.sh
./scripts/extract-triund-pmtiles.sh
cp trek-packs/triund/triund.pmtiles apps/web/public/trek-packs/triund/
```

### Overpass POI pull

```bash
curl -d @scripts/overpass-triund.query https://overpass-api.de/api/interpreter -o pois-raw.json
# Hand-curate into trek-packs/triund/pois.geojson
```

## Humsafar — honest architecture

**Demo transport**: ~30-line WebSocket relay on the local server. Two phones on a hotspot with mobile data off — positions stream device-to-device over local radio, zero internet.

**Production roadmap**: BLE mesh gossip (Meshtastic-pattern) — browsers can't broadcast BLE, so native wrapper required. Documented, not faked.

**QR crossed-paths fallback**: `/api/sync/qr/:peerId` — zero infrastructure when paths physically cross.

## 60-second video beats

1. Airplane mode ON on camera
2. Map glides across Dhauladhars, POIs light up
3. Slider near ridge → "Can I make Triund top before sunset?"
4. Bhasha Bridge: English in → Hindi out for the shepherd
5. Second phone SOS → red pulse → Gemma rescue brief
6. Close: "No signal. No server. The trail is the network."

## Stack

- [mapcn](https://mapcn.dev) — MIT, shadcn-styled MapLibre components
- [Protomaps / PMTiles](https://protomaps.com) — offline vector tiles
- [Gemma 4 E4B](https://ai.google.dev/gemma) — LiteRT-LM on-device
- Next.js 16, Tailwind v4, shadcn/ui

## License

MIT — map tiles © OpenStreetMap contributors (ODbL via Protomaps).
