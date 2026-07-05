import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { attachHumsafar } from "./humsafar.js";
import {
  bhashaTranslate,
  detectBackend,
  humsafarSosBrief,
  prakritiLens,
  trailSathiGuide,
} from "./gemma.js";
import { interpolatePosition, loadManifest, nearestPoi } from "./trek-tools.js";

const PORT = Number(process.env.PORT ?? 3847);

const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" }));

app.get("/health", async (_req, res) => {
  const backend = await detectBackend();
  res.json({ ok: true, backend, trek: "triund" });
});

app.get("/api/trek/:id/manifest", (req, res) => {
  if (req.params.id !== "triund") {
    res.status(404).json({ error: "Trek pack not found" });
    return;
  }
  res.json(loadManifest());
});

app.post("/api/guide", async (req, res) => {
  const { question, kmAlongTrail = 5.1 } = req.body as {
    question?: string;
    kmAlongTrail?: number;
  };
  if (!question?.trim()) {
    res.status(400).json({ error: "question required" });
    return;
  }
  const result = await trailSathiGuide(question, Number(kmAlongTrail));
  res.json(result);
});

app.post("/api/translate", async (req, res) => {
  const {
    audioBase64,
    sourceLang = "English",
    targetLang = "Hindi",
  } = req.body as {
    audioBase64?: string;
    sourceLang?: string;
    targetLang?: string;
  };
  if (!audioBase64) {
    res.status(400).json({ error: "audioBase64 required" });
    return;
  }
  const result = await bhashaTranslate(audioBase64, sourceLang, targetLang);
  res.json(result);
});

app.post("/api/lens", async (req, res) => {
  const { imageBase64, kmAlongTrail = 5.1 } = req.body as {
    imageBase64?: string;
    kmAlongTrail?: number;
  };
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 required" });
    return;
  }
  const result = await prakritiLens(imageBase64, Number(kmAlongTrail));
  res.json(result);
});

app.post("/api/sos/brief", async (req, res) => {
  const { kmAlongTrail, sosPeer } = req.body as {
    kmAlongTrail?: number;
    sosPeer?: { name: string; lat: number; lng: number };
  };
  const position = interpolatePosition(Number(kmAlongTrail ?? 5.1));
  const exit = nearestPoi(position, "exit");
  const shelter = nearestPoi(position, "shelter");
  const manifest = loadManifest();

  let gemmaBrief: string | null = null;
  let sosBrief: unknown = null;
  let briefBackend: string | null = null;
  if (sosPeer) {
    const r = await humsafarSosBrief(Number(kmAlongTrail ?? 5.1), sosPeer);
    gemmaBrief = r.text;
    sosBrief = r.brief;
    briefBackend = r.backend;
  }

  const lkpCode = `PD-${position.lat.toFixed(3).replace(".", "")}-${position.lng.toFixed(3).replace(".", "")}`;

  res.json({
    position,
    nearestExit: exit,
    nearestShelter: shelter,
    emergency: manifest.emergency,
    lastKnownPositionCode: lkpCode,
    gemmaBrief,
    sosBrief,
    briefBackend,
  });
});

// QR crossed-paths sync payload (zero-infrastructure fallback)
app.get("/api/sync/qr/:peerId", (req, res) => {
  const manifest = loadManifest();
  res.json({
    peerId: req.params.peerId,
    trekId: manifest.id,
    exportedAt: new Date().toISOString(),
    note: "Scan when paths cross — exchanges breadcrumb + SOS flags with zero server.",
  });
});

const httpServer = createServer(app);
attachHumsafar(httpServer);

httpServer.listen(PORT, () => {
  console.log(`PagDandi server on http://localhost:${PORT}`);
  console.log(`  Trail Sathi API: POST /api/guide`);
  console.log(`  Bhasha Bridge:   POST /api/translate`);
  console.log(`  Humsafar relay:  ws://localhost:${PORT}/humsafar?room=triund`);
});
