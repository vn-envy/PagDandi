# Gemma 4 Development Skill for PagDandi / Trail Sathi

Use this skill when building features that call Gemma 4 E4B (LiteRT-LM or Ollama).

## Models

- **Primary**: `gemma-4-E4B-it` via LiteRT-LM (`litert-lm run --from-huggingface-repo=litert-community/gemma-4-E4B-it-litert-lm`)
- **Fallback**: Ollama `gemma4:4b` or `gemma4:4b-it`

## LiteRT-LM OpenAI-compatible server

```bash
litert-lm serve gemma-4-E4B-it.litertlm --port 8080
# PagDandi server expects LITERT_URL=http://127.0.0.1:8080/v1
```

## Chat template (Trail Sathi system prompt)

Gemma 4 supports native `system` role. PagDandi injects trek manifest + live GPS in the system prompt. The model must call tools before distance/time claims.

## Tool definitions (OpenAI format)

See `server/src/trek-tools.ts` — `distance_to`, `nearest`, `remaining_ascent`, `sunset_time`.

## Audio — Bhasha Bridge (AST prompt)

```
Transcribe the following speech segment in {SOURCE_LANGUAGE}, then translate it into {TARGET_LANGUAGE}.
When formatting the answer, first output the transcription in {SOURCE_LANGUAGE}, then one newline, then output the string '{TARGET_LANGUAGE}: ', then the translation in {TARGET_LANGUAGE}.
```

- Audio sample rate: **16 kHz mono**
- Max clip: **30 seconds**
- Ollama: pass base64 audio in `images` field of `/api/generate`
- HuggingFace: `{"type": "audio", "audio": "<url or path>"}` in message content

## Audio — ASR only

```
Transcribe the following speech segment in {LANGUAGE} into {LANGUAGE} text.
Follow these specific instructions for formatting the answer:
* Only output the transcription, with no newlines.
* When transcribing numbers, write the digits, i.e. write 1.7 and not one point seven, and write 3 instead of three.
```

## KerasHub turn format (reference)

```
<|turn>user
<|audio|>{prompt text}<turn|>
<|turn>model
```

## Function calling loop

1. Send user message with tools registered
2. If `tool_calls` returned, execute locally, append `tool` role messages
3. Re-prompt until text response (max 4 rounds in PagDandi server)

## Demo without GPU

PagDandi's `simulator` backend runs the same tool functions deterministically — always label it in UI when active.

## Ollama specifics (verified)

- `gemma4:e4b` supports native `tools` and `thinking`. Disable thinking (`"think": false`) for trail latency — it costs ~30s/turn on CPU.
- Ollama returns `tool_calls[].function.arguments` as an **object**, not a JSON string (OpenAI-compatible servers use strings). Parse both.
- Audio: pass base64 **16 kHz mono WAV** in the `images` field of `/api/generate`. Browser `audio/webm` must be transcoded first (ffmpeg `-ar 16000 -ac 1`). Max 30s.
- AMX segfault on virtualized Sapphire Rapids CPUs: disable `libggml-cpu-sapphirerapids.so` so ollama falls back to AVX-512.
- Models lacking a tools template reject the `tools` field and the `tool` role; use prompt-based JSON tool calls and feed results back as user turns.
