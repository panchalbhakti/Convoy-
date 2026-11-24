// Geospatial helpers. Routes are arrays of [lat, lng].
const R = 6371008.8;
const M_PER_DEG = (R * Math.PI) / 180; // metres per degree of latitude
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Straight-line (great-circle) distance in metres. */
export function haversine(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Precompute cumulative distance along the route so progress lookups are cheap. */
export function buildRoute(coords, durationS = null) {
  const n = coords.length;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + haversine(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return { coords, cum, totalM: n ? cum[n - 1] : 0, durationS: durationS || null };
}

function lowerBound(cum, value) {
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function scan(route, lat, lng, from, to) {
  const { coords, cum } = route;
  const k = Math.cos(rad(lat)) * M_PER_DEG;
  let best = null;
  for (let i = from; i < to; i++) {
    const ax = (coords[i][1] - lng) * k;
    const ay = (coords[i][0] - lat) * M_PER_DEG;
    const bx = (coords[i + 1][1] - lng) * k;
    const by = (coords[i + 1][0] - lat) * M_PER_DEG;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.sqrt(px * px + py * py);
    if (!best || d < best.distM) best = { distM: d, progressM: cum[i] + t * (cum[i + 1] - cum[i]), seg: i };
  }
  return best;
}

/**
 * Snap a GPS point to the route.
 * Returns { progressM, distM, seg }: how far along the route the nearest route point is,
 * and how far the GPS point is from the route. Never compares raw lat/lng between vehicles.
 * `hintM` (previous progress) narrows the search so a route that loops back near itself
 * does not make a vehicle jump to the wrong part of the road.
 */
export function snapToRoute(route, lat, lng, hintM = null) {
  const n = route.coords.length;
  if (n < 2) return null;
  if (hintM != null) {
    const from = Math.max(0, lowerBound(route.cum, hintM - 2000) - 1);
    const to = Math.min(n - 1, lowerBound(route.cum, hintM + 15000) + 1);
    if (to > from) {
      const local = scan(route, lat, lng, from, to);
      if (local && local.distM <= 300) return local;
    }
  }
  return scan(route, lat, lng, 0, n - 1);
}

/** Position (and travel bearing) at `s` metres along the route. */
export function pointAlongRoute(route, s) {
  const { coords, cum, totalM } = route;
  const d = Math.max(0, Math.min(totalM, s));
  let i = lowerBound(cum, d);
  if (i === 0) i = 1;
  const a = coords[i - 1];
  const b = coords[i];
  const seg = cum[i] - cum[i - 1];
  const t = seg === 0 ? 0 : (d - cum[i - 1]) / seg;
  const lat = a[0] + (b[0] - a[0]) * t;
  const lng = a[1] + (b[1] - a[1]) * t;
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return { lat, lng, bearing: (deg(Math.atan2(y, x)) + 360) % 360 };
}

/** Move a point `meters` in direction `bearingDeg`. */
export function offsetPoint(lat, lng, bearingDeg, meters) {
  const b = rad(bearingDeg);
  return {
    lat: lat + (meters * Math.cos(b)) / M_PER_DEG,
    lng: lng + (meters * Math.sin(b)) / (M_PER_DEG * Math.cos(rad(lat))),
  };
}

/** Thin a long route for drawing on a map (never used for calculations). */
export function simplifyForDisplay(coords, maxPoints = 2500) {
  if (coords.length <= maxPoints) return coords;
  const total = buildRoute(coords).totalM;
  const step = Math.max(40, total / maxPoints);
  const out = [coords[0]];
  let last = coords[0];
  for (let i = 1; i < coords.length - 1; i++) {
    if (haversine(last[0], last[1], coords[i][0], coords[i][1]) >= step) {
      out.push(coords[i]);
      last = coords[i];
    }
  }
  out.push(coords[coords.length - 1]);
  return out;
}
