#!/usr/bin/env node
/**
 * Trek Pack builder for PagDandi.
 *
 * Consumes raw OSM data (fetched via Overpass, see scripts/README) and bakes a
 * single self-contained pack.json: stitched trail polyline with SRTM
 * elevations + cumulative distances, curated POI layers, exit/SOS points and
 * emergency numbers. The output lives in public/packs/<trek>/ next to the
 * PMTiles map bundle, and is everything the app needs offline.
 *
 * Usage: node scripts/build-pack.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("../data-src/", import.meta.url);
const OUT = new URL("../public/packs/triund/pack.json", import.meta.url);

// ---------------------------------------------------------------------------
// geometry helpers
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ---------------------------------------------------------------------------
// 1. stitch the trail from OSM route relations
// Order matters: roadhead -> Galu Devi -> Triund -> Indrahar Pass.
const RELATION_ORDER = [15522702, 15522720, 11232623];
const relations = JSON.parse(
  readFileSync(new URL("trail-relations.json", SRC)),
).elements;

function stitchRelation(rel, startNear) {
  // Greedy endpoint chaining: begin at the way whose endpoint is closest to
  // `startNear`, then repeatedly append the unused way whose endpoint is
  // nearest the current chain end (reversing ways as needed).
  const ways = rel.members
    .filter((m) => m.type === "way" && m.geometry?.length > 1)
    .map((m) => m.geometry.map((g) => ({ lat: g.lat, lon: g.lon })));

  let best = null;
  for (let i = 0; i < ways.length; i++) {
    for (const rev of [false, true]) {
      const pts = rev ? [...ways[i]].reverse() : ways[i];
      const d = haversine(pts[0], startNear);
      if (!best || d < best.d) best = { i, rev, d };
    }
  }
  const used = new Set([best.i]);
  let chain = best.rev ? [...ways[best.i]].reverse() : [...ways[best.i]];

  while (used.size < ways.length) {
    const end = chain[chain.length - 1];
    let next = null;
    for (let i = 0; i < ways.length; i++) {
      if (used.has(i)) continue;
      for (const rev of [false, true]) {
        const pts = rev ? [...ways[i]].reverse() : ways[i];
        const d = haversine(pts[0], end);
        if (!next || d < next.d) next = { i, rev, d };
      }
    }
    // Stop chaining when the nearest remaining way is a detached spur
    // (route relations often carry side branches we don't want).
    if (!next || next.d > 150) break;
    used.add(next.i);
    const pts = next.rev ? [...ways[next.i]].reverse() : ways[next.i];
    chain = chain.concat(pts.slice(1));
  }
  return chain;
}

const anchors = [
  { lat: 32.2454, lon: 76.3294 }, // Dharamkot roadhead
  { lat: 32.2546, lon: 76.3259 }, // Galu Devi temple
  { lat: 32.2742, lon: 76.3616 }, // above Triund toward Laka Got
];
let trail = [];
RELATION_ORDER.forEach((id, idx) => {
  const rel = relations.find((r) => r.id === id);
  const seg = stitchRelation(rel, trail.length ? trail[trail.length - 1] : anchors[idx]);
  trail = trail.length ? trail.concat(seg.slice(1)) : seg;
});

// Clip at Indrahar Pass — the OSM relation continues down the Chamba side.
const PASS = { lat: 32.29756, lon: 76.38126 };
let clipIdx = 0;
let clipBest = Infinity;
trail.forEach((p, i) => {
  const d = haversine(p, PASS);
  if (d < clipBest) {
    clipBest = d;
    clipIdx = i;
  }
});
trail = trail.slice(0, clipIdx + 1);

// Downsample to ~40 m spacing to keep the pack small and the elevation
// requests bounded.
const MIN_SPACING = 40;
const sampled = [trail[0]];
for (const p of trail) {
  if (haversine(sampled[sampled.length - 1], p) >= MIN_SPACING) sampled.push(p);
}
if (sampled[sampled.length - 1] !== trail[trail.length - 1])
  sampled.push(trail[trail.length - 1]);

console.log(`trail: ${trail.length} raw pts -> ${sampled.length} sampled pts`);

// ---------------------------------------------------------------------------
// 2. elevations from OpenTopoData SRTM 30m (100 pts/request, 1 rps)
async function fetchElevations(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 100) {
    const batch = points.slice(i, i + 100);
    const locs = batch.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join("|");
    const res = await fetch("https://api.opentopodata.org/v1/srtm30m", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations: locs }),
    });
    if (!res.ok) throw new Error(`elevation batch failed: ${res.status}`);
    const json = await res.json();
    out.push(...json.results.map((r) => r.elevation));
    console.log(`elevation: ${Math.min(i + 100, points.length)}/${points.length}`);
    await new Promise((r) => setTimeout(r, 1100));
  }
  return out;
}

const elevations = await fetchElevations(sampled);

// cumulative distance + pack the trail as [lon, lat, ele, distFromStart]
let cum = 0;
const trailPacked = sampled.map((p, i) => {
  if (i > 0) cum += haversine(sampled[i - 1], p);
  return [
    +p.lon.toFixed(6),
    +p.lat.toFixed(6),
    Math.round(elevations[i] ?? 0),
    Math.round(cum),
  ];
});
console.log(
  `total ${(cum / 1000).toFixed(2)} km, ` +
    `${Math.min(...elevations)}m -> ${Math.max(...elevations)}m`,
);

// ---------------------------------------------------------------------------
// 3. POI curation
const rawPois = JSON.parse(readFileSync(new URL("pois-raw.json", SRC))).elements;

function distToTrail(p) {
  let best = Infinity;
  for (const t of sampled) best = Math.min(best, haversine(p, t));
  return best;
}

const CATEGORY = [
  ["viewpoint", (t) => t.tourism === "viewpoint"],
  ["campsite", (t) => t.tourism === "camp_site"],
  ["water", (t) => t.natural === "spring" || t.amenity === "drinking_water"],
  [
    "shelter",
    (t) =>
      t.amenity === "shelter" ||
      t.tourism === "alpine_hut" ||
      t.tourism === "wilderness_hut" ||
      t.natural === "cave_entrance",
  ],
  ["cafe", (t) => t.amenity === "cafe"],
  ["temple", (t) => t.amenity === "place_of_worship"],
  ["peak", (t) => t.natural === "peak" || t.natural === "saddle" || t.mountain_pass === "yes"],
];

const pois = [];
for (const e of rawPois) {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (lat == null) continue;
  const cat = CATEGORY.find(([, fn]) => fn(t))?.[0];
  if (!cat) continue;
  const d = distToTrail({ lat, lon });
  // Keep POIs within 600 m of the trail corridor; cafes/temples only if on it.
  const limit = cat === "cafe" || cat === "temple" ? 250 : 600;
  if (d > limit) continue;
  pois.push({
    id: `osm-${e.type}-${e.id}`,
    name: t.name ?? null,
    category: cat,
    lat: +lat.toFixed(6),
    lon: +lon.toFixed(6),
    ele: t.ele ? Math.round(parseFloat(t.ele)) : null,
    offTrail: Math.round(d),
  });
}

// Hand-curated additions & fixes for the demo trek. These are the waypoints
// every Triund trekker knows; OSM tagging alone misses or misnames a few.
const CURATED = [
  { id: "wp-galu", name: "Galu Devi Temple (trailhead)", category: "waypoint", lat: 32.25459, lon: 76.3259, ele: 2130 },
  { id: "wp-magicview", name: "Magic View Café (1st rest point)", category: "cafe", lat: 32.25582, lon: 76.34275, ele: 2390 },
  { id: "wp-snowline", name: "Snowline Café (last supplies)", category: "cafe", lat: 32.27414, lon: 76.36157, ele: 3350 },
  { id: "wp-triund", name: "Triund Top (campsite & meadow)", category: "campsite", lat: 32.2695, lon: 76.3491, ele: 3206 },
  { id: "wp-lahesh", name: "Lahesh Cave (high shelter)", category: "shelter", lat: 32.29019, lon: 76.3742, ele: 3747 },
  { id: "wp-indrahar", name: "Indrahar Pass (4,342 m)", category: "peak", lat: 32.29756, lon: 76.38126, ele: 4342 },
  { id: "vp-triund-ridge", name: "Dhauladhar viewpoint (Triund ridge)", category: "viewpoint", lat: 32.2706, lon: 76.3512, ele: 3230 },
  { id: "vp-kangra", name: "Kangra Valley viewpoint", category: "viewpoint", lat: 32.2607, lon: 76.3418, ele: 2620 },
  { id: "wtr-triund-tank", name: "Triund water point (seasonal tank)", category: "water", lat: 32.2689, lon: 76.3486, ele: 3195 },
];

// Exit / SOS points: where a trail meets road, help or network again.
const EXITS = [
  { id: "exit-galu", name: "Galu Devi roadhead", lat: 32.25459, lon: 76.3259, ele: 2130, note: "Jeep track to Dharamkot; taxis & mobile network. Nearest road exit for the lower trail." },
  { id: "exit-dharamkot", name: "Dharamkot village", lat: 32.2454, lon: 76.3294, ele: 2010, note: "Full village: road, network, guesthouses, supplies." },
  { id: "exit-mcleod", name: "McLeod Ganj", lat: 32.2381, lon: 76.3235, ele: 1770, note: "Town with hospital access (Delek Hospital), police post, bus stand." },
  { id: "exit-bhagsu", name: "Bhagsu Nag", lat: 32.2443, lon: 76.3346, ele: 1900, note: "Alternate descent via Bhagsu waterfall trail; road and network." },
];

const dedup = new Map();
for (const p of [...CURATED.map((p) => ({ ...p, offTrail: 0 })), ...pois]) {
  // curated entries win over raw OSM ones at ~the same spot
  const key = `${p.category}:${p.lat.toFixed(3)}:${p.lon.toFixed(3)}`;
  if (!dedup.has(key)) dedup.set(key, p);
}

const pack = {
  format: "pagdandi-trekpack/1",
  builtAt: new Date().toISOString().slice(0, 10),
  trek: {
    id: "triund-indrahar",
    name: "Triund – Indrahar Pass",
    region: "Dhauladhar range, Kangra, Himachal Pradesh",
    country: "IN",
    timezone: "Asia/Kolkata",
    difficulty: "Triund: easy-moderate day hike. Beyond Laka Got: alpine, requires experience.",
    bbox: [76.26, 32.19, 76.48, 32.38],
    map: { pmtiles: "map.pmtiles", attribution: "© OpenStreetMap contributors, Protomaps" },
    languages: ["hi", "en", "gaddi (pahari dialect — use Hindi)"],
    emergency: [
      { label: "All-India emergency", number: "112" },
      { label: "HP Disaster Management", number: "1077" },
      { label: "Ambulance", number: "108" },
      { label: "Police, McLeod Ganj", number: "01892-221483" },
    ],
    notes: [
      "Snowline Café is the last reliable food/water purchase point.",
      "Weather turns fast above Laka Got; afternoon whiteouts are common.",
      "Mobile network is patchy after Magic View Café and gone past Snowline.",
      "Beyond Lahesh Cave the route is a boulder scramble — do not attempt in rain or snow without a guide.",
    ],
  },
  // [lon, lat, ele_m, cumulative_distance_m]
  trail: trailPacked,
  stats: {
    lengthM: Math.round(cum),
    minEle: Math.min(...elevations),
    maxEle: Math.max(...elevations),
    ascentM: Math.round(
      elevations.reduce((a, e, i) => (i && e > elevations[i - 1] ? a + e - elevations[i - 1] : a), 0),
    ),
  },
  pois: [...dedup.values()],
  exits: EXITS,
};

writeFileSync(OUT, JSON.stringify(pack));
console.log(
  `pack.json written: ${pack.pois.length} POIs, ${EXITS.length} exits, ` +
    `${(JSON.stringify(pack).length / 1024).toFixed(0)} KB`,
);
