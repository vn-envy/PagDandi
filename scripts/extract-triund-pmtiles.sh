#!/usr/bin/env bash
# Extract offline PMTiles for Triund–Indrahar (McLeod Ganj)
# Requires go-pmtiles CLI: https://github.com/protomaps/go-pmtiles/releases

set -euo pipefail

BBOX="76.26,32.17,76.44,32.34"
OUT="${1:-./trek-packs/triund/triund.pmtiles}"
SOURCE="${PMTILES_SOURCE:-https://data.source.coop/protomaps/openstreetmap/v4.pmtiles}"

echo "Extracting Triund region (bbox=$BBOX) → $OUT"
pmtiles extract "$SOURCE" "$OUT" --bbox="$BBOX" --maxzoom=14
echo "Done. Copy to apps/web/public/trek-packs/triund/ for the web app."
