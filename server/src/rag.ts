import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Trek Pack RAG — the "intelligence" half of "map + intelligence in one file".
 *
 * almanac.md ships inside the trek pack. Chunks are embedded on-device via
 * EmbeddingGemma (ollama /api/embed) the first time a question arrives; the
 * vectors are persisted next to the almanac so every later run — including
 * fully offline ones — reuses them. If the embedding model isn't pulled,
 * retrieval falls back to keyword scoring and says so.
 */

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "embeddinggemma";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TREK_ROOT = join(__dirname, "../../trek-packs/triund");
const ALMANAC_PATH = join(TREK_ROOT, "almanac.md");
const VECTORS_PATH = join(TREK_ROOT, "almanac-embeddings.json");

export interface AlmanacChunk {
  id: string;
  title: string;
  text: string;
}

export type RetrievalMethod = "embeddinggemma" | "keyword";

export interface RetrievalResult {
  chunks: AlmanacChunk[];
  method: RetrievalMethod;
}

let chunksCache: AlmanacChunk[] | null = null;
let vectorsCache: Map<string, number[]> | null = null;
let embedUnavailable = false;

export function loadAlmanacChunks(): AlmanacChunk[] {
  if (chunksCache) return chunksCache;
  if (!existsSync(ALMANAC_PATH)) {
    chunksCache = [];
    return chunksCache;
  }
  const md = readFileSync(ALMANAC_PATH, "utf-8");
  const sections = md.split(/^## /m).slice(1); // drop the intro/title block
  chunksCache = sections.map((s, i) => {
    const [titleLine, ...rest] = s.split("\n");
    return {
      id: `alm-${i}`,
      title: titleLine.trim(),
      text: rest.join("\n").trim(),
    };
  });
  return chunksCache;
}

async function embed(inputs: string[]): Promise<number[][] | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embeddings?: number[][] };
    return data.embeddings ?? null;
  } catch {
    return null;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Load persisted vectors if they match the current almanac + model. */
function loadPersistedVectors(chunks: AlmanacChunk[]): Map<string, number[]> | null {
  try {
    if (!existsSync(VECTORS_PATH)) return null;
    const data = JSON.parse(readFileSync(VECTORS_PATH, "utf-8")) as {
      model: string;
      vectors: Record<string, number[]>;
    };
    if (data.model !== EMBED_MODEL) return null;
    const map = new Map(Object.entries(data.vectors));
    return chunks.every((c) => map.has(c.id)) ? map : null;
  } catch {
    return null;
  }
}

async function ensureVectors(chunks: AlmanacChunk[]): Promise<Map<string, number[]> | null> {
  if (vectorsCache) return vectorsCache;
  if (embedUnavailable) return null;

  const persisted = loadPersistedVectors(chunks);
  if (persisted) {
    vectorsCache = persisted;
    return vectorsCache;
  }

  const embeddings = await embed(chunks.map((c) => `${c.title}\n${c.text}`));
  if (!embeddings || embeddings.length !== chunks.length) {
    embedUnavailable = true; // remember; keyword fallback from here on
    return null;
  }
  vectorsCache = new Map(chunks.map((c, i) => [c.id, embeddings[i]]));
  try {
    writeFileSync(
      VECTORS_PATH,
      JSON.stringify({ model: EMBED_MODEL, vectors: Object.fromEntries(vectorsCache) }),
    );
  } catch {
    /* pack dir read-only — in-memory cache still works */
  }
  return vectorsCache;
}

function keywordRetrieve(query: string, chunks: AlmanacChunk[], k: number): AlmanacChunk[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-zऀ-ॿ]+/)
    .filter((t) => t.length > 3);
  const scored = chunks.map((c) => {
    const hay = `${c.title} ${c.text}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (c.title.toLowerCase().includes(t)) score += 3;
      else if (hay.includes(t)) score += 1;
    }
    return { c, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.c);
}

/** Top-k almanac chunks for a question. Null when nothing relevant/no almanac. */
export async function retrieveAlmanac(query: string, k = 2): Promise<RetrievalResult | null> {
  const chunks = loadAlmanacChunks();
  if (!chunks.length) return null;

  const vectors = await ensureVectors(chunks);
  if (vectors) {
    const [qVec] = (await embed([query])) ?? [];
    if (qVec) {
      const ranked = chunks
        .map((c) => ({ c, score: cosine(qVec, vectors.get(c.id)!) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .filter((r) => r.score > 0.35);
      if (ranked.length) return { chunks: ranked.map((r) => r.c), method: "embeddinggemma" };
      return null;
    }
  }

  const kw = keywordRetrieve(query, chunks, k);
  return kw.length ? { chunks: kw, method: "keyword" } : null;
}

/** Prompt block + UI meta for a retrieval, ready to append to the system prompt. */
export async function almanacBlock(
  query: string,
): Promise<{ block: string; meta: { method: RetrievalMethod; titles: string[] } | null }> {
  const r = await retrieveAlmanac(query);
  if (!r) return { block: "", meta: null };
  const block = `\n\nTREK ALMANAC (retrieved from the trek pack for this question — trust it over general knowledge):\n${r.chunks
    .map((c) => `[${c.title}]\n${c.text}`)
    .join("\n\n")}`;
  return { block, meta: { method: r.method, titles: r.chunks.map((c) => c.title) } };
}
