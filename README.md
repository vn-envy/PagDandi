# PagDandi (पगडंडी — "the footpath")

An offline sherpa in your pocket for Himalayan trekking. Download a **Trek Pack** — one file bundle with map, trail, and intelligence — and everything works in airplane mode.

Built for **Gemma 4 E4B** on-device: Trail Sathi (tool-calling guide), Bhasha Bridge (speech translation), and Humsafar (peer safety network).

## Trek: Triund–Indrahar (McLeod Ganj)

Default demo trek — dense OSM data, foreign-backpacker crowd, perfect for translation demos.

## Features

| Feature | What it does |
|---------|----------------|
| **Offline map** | PMTiles vector basemap (Protomaps/OSM) via mapcn + MapLibre GL, POI layer toggles |
| **Elevation profile** | Interactive chart — drag to scrub your position along the trail (demo rig) |
| **Trail Sathi** | Gemma 4 E4B calls local tools: `distance_to`, `nearest`, `remaining_ascent`, `sunset_time` |
| **Bhasha Bridge** | 30s audio clips → ffmpeg 16kHz → Gemma AST → Hindi ⇄ English with TTS read-aloud |
| **Prakriti Lens** | Camera/photo → Gemma vision identifies flora, fauna & peaks with altitude-aware sherpa context — never medical/edibility advice |
| **SOS card** | Nearest exit/shelter, emergency numbers, shareable LKP code — navigation only |
| **Humsafar** | Glowing peer dots via LAN WebSocket relay; SOS beacon triggers a full-width alert with a Gemma rescue brief |

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

# Option B: Ollama
ollama pull gemma4:e4b
ollama serve
export OLLAMA_URL=http://127.0.0.1:11434
export GEMMA_MODEL=gemma4:e4b   # default
```

The server auto-detects LiteRT-LM → Ollama → an honest **simulator** that executes the same trek tools — always labeled in the UI.

Verified working with real Gemma via Ollama:
- **Trail Sathi**: native function calling — the model calls `remaining_ascent` + `sunset_time` before answering summit-timing questions (~25s/turn on 4-core CPU, thinking disabled for latency)
- **Bhasha Bridge**: browser audio is transcoded server-side (ffmpeg → 16 kHz mono WAV) and passed to Gemma's speech-translation prompt; English speech → Hindi text in ~8s
- **Prakriti Lens**: camera frames are downscaled client-side (≤1024px JPEG) and sent to Gemma vision with the trek/elevation context in the prompt (~25–50s on CPU)

Notes:
- `ffmpeg` is required on the server for Bhasha Bridge audio transcoding
- On some virtualized Intel CPUs (Sapphire Rapids with AMX), ollama's AMX backend segfaults on Gemma models. Workaround: `sudo mv /usr/local/lib/ollama/libggml-cpu-sapphirerapids.so{,.disabled}` and restart `ollama serve` — it falls back to the stable AVX-512 backend
- Models without native tool support work too: the server falls back to prompt-based tool calling (JSON blocks parsed from the reply)

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
