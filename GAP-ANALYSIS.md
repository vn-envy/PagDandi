# PagDandi — Strengths & Gap Analysis

*Against the RAISE Summit 2026 Google remote build track (local Gemma). July 5, 2026.*

## Judging context

RAISE Summit hackathon (Paris, summit July 8–9; Cerebral Valley co-organized, €250k+ pool). Public materials don't publish the remote-track rubric, but Google's Gemma challenge pattern is consistent across the Gemma 3n Impact Challenge and the 2026 Gemma 4 challenges: **impact & vision weighted heaviest (~40%)**, then technical execution/depth of Gemma usage, then clarity of communication — with required artifacts: working demo, public repo, technical write-up, short video. "Local Gemma" tracks specifically reward *provably on-device* inference.

## Strengths

| Strength | Why it scores |
|---|---|
| Offline-first premise is real | PMTiles vector maps + local Gemma + LAN relay: the entire loop runs in airplane mode. This is *the* thesis of a local-Gemma track, not a bolt-on. |
| Verified native function calling | Trail Sathi runs a real multi-round tool loop (max 4 rounds) with `remaining_ascent` + `sunset_time` called before summit-timing answers — matches Gemma 4's agentic positioning (E4B jumped to 57.5% on τ2-bench vs 6.6% for Gemma 3 27B). |
| All three E4B modalities used | Text+tools (Sathi), audio AST at 16kHz mono (Bhasha), vision with altitude context (Lens). Few hackathon projects touch audio at all. |
| Honest engineering | Labeled simulator fallback, documented Ollama quirks (AMX segfault, vision-refusal retry, KV-cache nonce), prompt-based tool fallback for models without tool templates. Excellent write-up material. |
| Safety-by-design | No medical/edibility advice, decisive 2–4 sentence answers, Naismith margin rule, nav-only SOS. Judges probe safety on outdoor apps. |
| Trek Pack as unit of scale | manifest + trail + POIs + tiles in one bundle → "any trail, one download" growth story for Impact & Vision. |
| Demo choreography | The 60-second video beats in the README map 1:1 onto submission requirements. |

## Gaps

1. **SOS brief never actually uses Gemma.** `humsafarSosBrief()` calls the simulator string template even when a live backend is up — but the UI labels it "Trail Sathi" and the README calls it a "Gemma rescue brief." With an "honest architecture" brand, this is the highest-risk gap in the repo. Fix first.
2. **Latency.** ~25s/turn chat, 25–50s vision on CPU. Fine on video, painful in live judging. No token streaming to the UI, so it feels slower than it is.
3. **Shallow tool surface.** Four tools, two of which take no arguments. E4B is explicitly marketed for "nuanced function-calling schemas" — nothing here demonstrates typed enums, nested objects, or parallel calls.
4. **Gemma is siloed to Sathi.** Lens and the SOS path do plain generation with no tool grounding; Bhasha is a single prompt. The tool-calling story exists in one tab.
5. **Web app itself isn't offline.** `manifest.webmanifest` exists but there's no service worker; "airplane mode" works only because the dev server is on localhost. Also `theme_color` is still orange.
6. **Demo rig position.** The slider is honest, but there's no geolocation path at all — one `navigator.geolocation` toggle would land the "this is real" beat.
7. **Context window unused.** `num_ctx: 4096` and a compressed POI list, while E4B supports 128K+. No trek guide, no flora almanac, no route notes in context.
8. **No eval harness.** Nothing measures tool-call accuracy or translation quality. A 20-question eval table in the write-up is cheap credibility.

## Gemma 4 capabilities to build toward

Ordered by (impact on judging) ÷ (effort):

1. **Real Gemma SOS brief with thinking mode + structured output.** Route `humsafarSosBrief` through the live backend with `think: true` (Google's docs show thinking materially improves function-call precision) and a JSON-schema output (`eta_min`, `bearing`, `hazards[]`, `advice`) rendered as a card. Fixes gap 1 and showcases two Gemma 4 features in the most dramatic demo beat.
2. **Richer tool schemas + parallel calls.** Add `route_eta {from_km, to_poi_id, pace: enum}`, `water_status {poi_id}`, `mark_hazard {type: enum, note}` (a *write* tool), `weather_window {hours_ahead}`. Gemma 4 emits multiple `tool_calls` per turn — the loop already handles it; the tools just don't exist yet.
3. **FunctionGemma (270M) as instant router.** Google ships a dedicated compact function-calling Gemma. Use it for sub-second intent→tool dispatch on-device, reserving E4B for final prose. Directly attacks the 25s latency gap and is a "deep ecosystem knowledge" flex.
4. **EmbeddingGemma offline RAG in the Trek Pack.** Precompute embeddings for a trail guide/flora almanac at pack build time; retrieve into E4B context on-device. Makes "map + intelligence in one file" literal, and uses a second Gemma-family model offline.
5. **Streaming tokens.** Ollama/LiteRT-LM both stream; pipe SSE to the UI. Perceived latency drops ~10x for free.
6. **Vision + tool fusion in Lens.** Let Lens call `nearest`/`remaining_ascent` while identifying — "that's Indrahar Pass, 1,240m above you, ~4h away" — interleaved multimodal + tools in one turn.
7. **Multilinguality beyond hi⇄en.** Gemma 4 covers 140 languages — add Nepali, Pahari, and French (RAISE is in Paris; a French demo beat will land in the room).
8. **128K context.** Load the full manifest, POI descriptions, and route notes instead of the compressed summary; drop the interpolation guesswork from prompts.

**48-hour priority:** 1 → 5 → 2 → 6, plus a service worker (gap 5) and a geolocation toggle (gap 6). Items 3–4 are the ambitious differentiators if time allows.

## UI/UX pass (applied in this repo)

Monochrome, Apple-like minimal: neutral oklch palette with red reserved exclusively for SOS; Protomaps `white`/`black` basemap flavors so the trail line and position dot are the only figure on a quiet ground; orange/blue/emerald/amber/sky/green accents replaced with foreground/muted tones; off-white page ground with white cards, softer radii, translucent blurred header; PWA `theme_color` neutralized. Trail, elevation profile, markers, and POI chips are now ink-on-paper; peers read as solid dots, SOS pulses red.

## Sources

- [RAISE Summit Hackathon](https://www.raisesummit.com/hackathon) · [Cerebral Valley event page](https://cerebralvalley.ai/e/raise-summit-hackathon)
- [Gemma 4 — Google DeepMind](https://deepmind.google/models/gemma/gemma-4/) (E2B/E4B specs, τ2-bench, capabilities)
- [Function calling with Gemma 4](https://ai.google.dev/gemma/docs/capabilities/text/function-calling-gemma4) (tool format, thinking mode, schema caveats)
- [FunctionGemma](https://ai.google.dev/gemma/docs/functiongemma) · [EmbeddingGemma](https://ai.google.dev/gemma/docs/embeddinggemma)
- [Gemma 3n Impact Challenge (judging pattern)](https://www.kaggle.com/competitions/google-gemma-3n-hackathon) · [Gemma 4 DEV challenge](https://dev.to/challenges/google-gemma-2026-05-06)
