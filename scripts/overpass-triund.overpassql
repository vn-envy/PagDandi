/*
 * PagDandi POI extraction — Triund–Indrahar (Dhauladhar, McLeod Ganj).
 *
 * Run once (with internet) at https://overpass-turbo.eu or via curl:
 *   curl -s -d @scripts/overpass-triund.overpassql \
 *        https://overpass-api.de/api/interpreter > scripts/triund-pois.osm.json
 *
 * bbox is (south, west, north, east) = the Trek Pack bbox in Overpass order.
 * These are the five demo POI layers: viewpoints, campsites, water sources,
 * shelters and exit/SOS points, plus food/chai stalls.
 */
[out:json][timeout:60];
(
  node["tourism"="viewpoint"](32.244,76.318,32.290,76.372);
  node["tourism"="camp_site"](32.244,76.318,32.290,76.372);
  node["natural"="spring"](32.244,76.318,32.290,76.372);
  node["amenity"="drinking_water"](32.244,76.318,32.290,76.372);
  node["amenity"="shelter"](32.244,76.318,32.290,76.372);
  node["natural"="cave_entrance"](32.244,76.318,32.290,76.372);
  node["mountain_pass"="yes"](32.244,76.318,32.290,76.372);
  node["amenity"="cafe"](32.244,76.318,32.290,76.372);
  node["shop"="kiosk"](32.244,76.318,32.290,76.372);
);
out center;
