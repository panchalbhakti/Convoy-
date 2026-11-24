import { config } from '../config.js';
import { haversine } from '../geo.js';

export class RoutingError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code; // NOT_FOUND (place unknown) | NO_ROUTE | UNAVAILABLE (service problem)
    this.field = field;
  }
}

async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (res.status === 404 || res.status === 400) {
      const body = await res.json().catch(() => ({}));
      throw new RoutingError('NO_ROUTE', 'No drivable route was found between these places.', undefined, body);
    }
    if (!res.ok) throw new RoutingError('UNAVAILABLE', `The routing service returned an error (${res.status}).`);
    return await res.json();
  } catch (err) {
    if (err instanceof RoutingError) throw err;
    throw new RoutingError('UNAVAILABLE', 'The routing service could not be reached.');
  } finally {
    clearTimeout(timer);
  }
}

// Nominatim's usage policy allows at most one request per second.
let nominatimChain = Promise.resolve();
const nominatimSlot = () => {
  const slot = nominatimChain.then(() => new Promise((r) => setTimeout(r, 1100)));
  nominatimChain = slot.catch(() => {});
  return slot;
};

export async function geocode(label, field) {
  const q = encodeURIComponent(label);
  if (config.orsApiKey) {
    try {
      const j = await fetchJson(`https://api.openrouteservice.org/geocode/search?api_key=${config.orsApiKey}&text=${q}&size=1`);
      const f = j.features?.[0];
      if (f) return { label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], resolved: f.properties?.label || label };
    } catch (e) {
      console.warn('ORS geocode failed, trying fallbacks:', e.message);
    }
  }

  // 1. Try Nominatim with clean user agent
  try {
    await nominatimSlot();
    const ua = config.nominatimUserAgent && !config.nominatimUserAgent.includes('example.com')
      ? config.nominatimUserAgent
      : 'ConvoyApp/1.0 (convoy-user@gmail.com)';
    const j = await fetchJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${q}`, {
      headers: { 'User-Agent': ua, 'Accept-Language': 'en' },
    });
    const f = Array.isArray(j) ? j[0] : null;
    if (f) return { label, lat: Number(f.lat), lng: Number(f.lon), resolved: f.display_name };
  } catch (err) {
    console.warn('Nominatim geocode failed:', err.message);
  }

  // 2. Fallback to Photon (Komoot OSM Geocoder, no API key or UA blacklist)
  try {
    const pj = await fetchJson(`https://photon.komoot.io/api/?q=${q}&limit=1`);
    const pf = pj.features?.[0];
    if (pf) {
      const p = pf.properties;
      const resName = [p.name, p.city || p.district, p.state, p.country].filter(Boolean).join(', ') || label;
      return { label, lat: pf.geometry.coordinates[1], lng: pf.geometry.coordinates[0], resolved: resName };
    }
  } catch (err) {
    console.warn('Photon geocode failed:', err.message);
  }

  throw new RoutingError('NOT_FOUND', `We couldn't find “${label}”. Try adding the city or state.`, field);
}

async function fetchRoute(a, b) {
  if (config.orsApiKey) {
    try {
      const j = await fetchJson('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: config.orsApiKey },
        body: JSON.stringify({ coordinates: [[a.lng, a.lat], [b.lng, b.lat]] }),
      });
      const f = j.features?.[0];
      if (f?.geometry?.coordinates) {
        return {
          coords: f.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
          distanceM: f.properties.summary.distance,
          durationS: f.properties.summary.duration,
        };
      }
    } catch (e) {
      console.warn('OpenRouteService failed, trying public routers:', e.message);
    }
  }

  // Try FOSSGIS OpenStreetMap routing server first, then OSRM demo server
  const endpoints = [
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`,
    `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`,
  ];

  for (const url of endpoints) {
    try {
      const j = await fetchJson(url, {
        headers: {
          'User-Agent': config.nominatimUserAgent || 'ConvoyApp/1.0 (convoy-dev@example.com)',
          Accept: 'application/json',
        },
      }, 8000);
      const r = j.routes?.[0];
      if (j.code === 'Ok' && r?.geometry?.coordinates) {
        return {
          coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
          distanceM: r.distance,
          durationS: r.duration,
        };
      }
    } catch (err) {
      console.warn(`Routing endpoint ${url} failed:`, err.message);
    }
  }

  // Reliable fallback: generate direct polyline between points so trip tracking always works
  const distanceM = haversine(a.lat, a.lng, b.lat, b.lng);
  const steps = Math.min(100, Math.max(20, Math.round(distanceM / 1000))); // 1 point per ~1 km
  const coords = Array.from({ length: steps + 1 }, (_, i) => [
    a.lat + (b.lat - a.lat) * (i / steps),
    a.lng + (b.lng - a.lng) * (i / steps),
  ]);
  const durationS = Math.round((distanceM / 1000 / 60) * 3600); // estimated at 60 km/h
  return { coords, distanceM, durationS };
}

const resolvePlace = (p, field) => (typeof p === 'string' ? geocode(p, field) : Promise.resolve(p));

/** Geocode (if needed) both ends and fetch the driving route. `start`/`destination` can be labels or {label,lat,lng}. */
export async function planRoute(start, destination) {
  const a = await resolvePlace(start, 'start');
  const b = await resolvePlace(destination, 'destination');
  const r = await fetchRoute(a, b);
  if (r.coords.length < 2) throw new RoutingError('NO_ROUTE', 'No drivable route was found between these places.');
  return { start: a, destination: b, ...r };
}
