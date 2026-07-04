#!/usr/bin/env node
/**
 * Mock LLM for harness development — NOT a demo stand-in.
 *
 * Speaks just enough of the Ollama protocol (/api/tags, /api/chat) to exercise
 * PagDandi's full agentic loop: it emits Trail Sathi tool calls in the same
 * JSON contract Gemma is prompted to use, consumes the tool results the app
 * feeds back, and then answers using ONLY numbers from those results.
 *
 * Use it to develop/test the transport + parsing + loop when no model runtime
 * is available (e.g. CI boxes without AVX). The real demo runs Gemma E4B via
 * LiteRT-LM serve or Ollama. The UI labels which brain answered either way.
 *
 *   node scripts/mock-llm.mjs   # listens on :11435
 *   LLM_ENDPOINT=http://127.0.0.1:11435 npm run dev
 */
import { createServer } from "node:http";

const PORT = process.env.MOCK_LLM_PORT ?? 11435;

function extract(messages) {
  const toolResults = messages
    .filter((m) => typeof m.content === "string" && m.content.startsWith("TOOL RESULT"))
    .map((m) => {
      try {
        return JSON.parse(m.content.slice(m.content.indexOf(":") + 1, m.content.lastIndexOf("}") + 1));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const user = messages.filter((m) => m.role === "user" && !String(m.content).startsWith("TOOL RESULT"));
  const question = String(user[user.length - 1]?.content ?? "").toLowerCase();
  const system = String(messages.find((m) => m.role === "system")?.content ?? "");
  return { toolResults, question, system };
}

function reply(messages) {
  const { toolResults, question, system } = extract(messages);

  // Bhasha Bridge text-translation system prompt
  if (system.startsWith("Translate the user's message")) {
    return "नमस्ते! क्या आपने ऊपर रास्ते में बर्फ़ देखी? (mock translation — run Gemma for the real thing)";
  }
  // Rescue brief
  if (system.includes("SOS beacon")) {
    const f = JSON.parse(messages[messages.length - 1].content);
    return `SOS from ${f.peer}, ${f.distance} away — move now, you can be there in about ${f.eta}. Sunset is at ${f.sunset}, so ${f.minutes_of_light > 60 ? "you have light" : "carry your headlamp"}. Fill water at ${f.nearest_water} on the way.`;
  }

  // Trail Sathi agentic loop
  if (toolResults.length === 0) {
    const place = question.includes("indrahar") ? "Indrahar Pass" : question.includes("snowline") ? "Snowline Cafe" : "Triund Top";
    if (/water/.test(question)) return JSON.stringify({ tool: "nearest", args: { category: "water" } });
    if (/shelter|rain|storm/.test(question)) return JSON.stringify({ tool: "nearest", args: { category: "shelter" } });
    if (/climb|ascent/.test(question)) return JSON.stringify({ tool: "remaining_ascent", args: {} });
    return JSON.stringify({ tool: "distance_to", args: { place } });
  }
  if (toolResults.length === 1 && /sunset|dark|night|before/.test(question) && !toolResults[0].results) {
    return JSON.stringify({ tool: "sunset_time", args: {} });
  }

  // final answer from accumulated tool results
  const leg = toolResults.find((r) => r.estimated_walk_time);
  const sun = toolResults.find((r) => r.minutes_until_sunset !== undefined);
  const near = toolResults.find((r) => r.results);
  if (leg && sun) {
    const margin = sun.minutes_until_sunset - leg.estimated_walk_minutes;
    return `${leg.place} is ${leg.distance_on_trail} ahead with ${leg.ascent_m} m of climb — about ${leg.estimated_walk_time}. Sunset is ${sun.sunset}, giving you ${margin} minutes of margin. ${margin > 30 ? "Go for it, keep a steady pace." : "Too tight — camp and go at first light."}`;
  }
  if (near) {
    const top = near.results[0];
    return `Nearest ${near.category}: ${top.name}, ${top.distance_on_trail} ${top.ahead_or_behind}, about ${top.estimated_walk_time}.`;
  }
  const r = toolResults[toolResults.length - 1];
  return `Here's what the trail data says: ${JSON.stringify(r)}`;
}

createServer((req, res) => {
  if (req.url === "/api/tags") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ models: [{ name: "mock-sathi" }] }));
    return;
  }
  if (req.url === "/api/chat" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { messages } = JSON.parse(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: { role: "assistant", content: reply(messages) }, done: true }));
      } catch (e) {
        res.writeHead(400).end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }
  res.writeHead(404).end(JSON.stringify({ error: "mock llm: only /api/tags and /api/chat" }));
}).listen(PORT, () => console.log(`mock LLM (Ollama protocol) on http://127.0.0.1:${PORT}`));
