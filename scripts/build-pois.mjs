#!/usr/bin/env node
/*
 * Convert Overpass output (scripts/triund-pois.osm.json) into PagDandi POIs.
 * Prints a JSON array you hand-curate into public/trek-packs/triund.json.
 *
 *   node scripts/build-pois.mjs > /tmp/pois.json
 *
 * Himalayan trails are unstructured, so treat the output as a STARTING point:
 * fade signs, split paths and stale nodes mean human curation is essential.
 */
import { readFileSync } from "node:fs";

const path = process.argv[2] || "scripts/triund-pois.osm.json";
const raw = JSON.parse(readFileSync(path, "utf8"));

function categorize(tags = {}) {
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.tourism === "camp_site") return "campsite";
  if (tags.natural === "spring" || tags.amenity === "drinking_water") return "water";
  if (tags.amenity === "shelter" || tags.natural === "cave_entrance") return "shelter";
  if (tags.mountain_pass === "yes") return "summit";
  if (tags.amenity === "cafe" || tags.shop === "kiosk") return "food";
  return null;
}

const pois = [];
for (const el of raw.elements || []) {
  const cat = categorize(el.tags);
  if (!cat) continue;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) continue;
  pois.push({
    id: `osm-${el.id}`,
    name: el.tags?.name || `${cat} (unnamed)`,
    category: cat,
    coord: [Number(lon.toFixed(5)), Number(lat.toFixed(5))],
    ele: el.tags?.ele ? Number(el.tags.ele) : undefined,
    note: el.tags?.description || undefined,
  });
}

console.log(JSON.stringify(pois, null, 2));
console.error(`Extracted ${pois.length} POIs from ${path}`);
