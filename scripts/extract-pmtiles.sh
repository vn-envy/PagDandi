#!/usr/bin/env bash
#
# PagDandi offline basemap — pull the trek's bounding box out of Protomaps'
# free daily planet build into a single ~30 MB offline PMTiles vector file.
# This is the "map in ~30 minutes" step. Run once, with internet.
#
# Requires the `pmtiles` CLI: https://github.com/protomaps/go-pmtiles/releases
#
# Trek Pack bbox [west,south,east,north] = 76.318,32.244,76.372,32.290
set -euo pipefail

BBOX_MINLON=76.318
BBOX_MINLAT=32.244
BBOX_MAXLON=76.372
BBOX_MAXLAT=32.290

OUT="public/trek-packs/triund.pmtiles"

# Latest daily planet build (small enough to range-request a bbox out of).
SRC="https://build.protomaps.com/$(date -u +%Y%m%d).pmtiles"

echo "Extracting $BBOX_MINLON,$BBOX_MINLAT,$BBOX_MAXLON,$BBOX_MAXLAT"
echo "from $SRC -> $OUT"

pmtiles extract "$SRC" "$OUT" \
  --bbox="$BBOX_MINLON,$BBOX_MINLAT,$BBOX_MAXLON,$BBOX_MAXLAT" \
  --maxzoom=15

echo "Done. Drop $OUT next to the manifest; PagDandi auto-detects it."
