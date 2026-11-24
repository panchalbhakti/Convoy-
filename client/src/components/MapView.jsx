import { createElement, useEffect, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Car, CarFront, Bike, Truck, Bus, Flag, MapPin } from 'lucide-react';

const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTR = import.meta.env.VITE_TILE_ATTRIBUTION || 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom';
const ICONS = { car: Car, suv: CarFront, bike: Bike, van: Truck, bus: Bus };
const svgCache = {};
const svg = (Icon, size, color = '#fff') => {
  const k = `${Icon.displayName || Icon.name}${size}${color}`;
  return (svgCache[k] ||= renderToStaticMarkup(createElement(Icon, { size, color, strokeWidth: 2.3 })));
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function markerSuffix(v) {
  if (v.flags.sos) return ' · SOS';
  if (!v.live) return v.status === 'disconnected' ? ' · Disconnected' : ' · No signal';
  if (v.offRoute) return ' · Off route';
  if (v.status === 'stopped') return ' · Stopped';
  return '';
}

function vehicleIcon(v, isMe, selected) {
  const cls = ['cv-marker', !v.live && 'cv-stale', v.flags.sos && 'cv-sos', isMe && 'cv-me', v.simulated && 'cv-sim'].filter(Boolean).join(' ');
  const name = `${isMe ? 'You · ' : ''}${esc(v.vehicleName)}${markerSuffix(v)}`;
  const html = `<div class="${cls}"><span class="cv-pin" style="--c:${v.color};${selected ? 'outline:2px solid #0F1B2D;outline-offset:2px;' : ''}">${svg(ICONS[v.vehicleType] || Car, 17)}${v.rank ? `<b class="cv-rank">${v.rank}</b>` : ''}</span><span class="cv-label">${name}</span></div>`;
  return L.divIcon({ className: 'cv-wrap', html, iconSize: [38, 38], iconAnchor: [19, 19] });
}

const placeIcon = (Icon, cls) =>
  L.divIcon({ className: 'cv-wrap', html: `<div class="cv-place ${cls}">${svg(Icon, 14, cls === 'start' ? '#16213A' : '#fff')}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });

/**
 * command: { type: 'fit' | 'me' | 'focus', id?, n } – change `n` to re-run the same command.
 * Vehicles with a last known position stay on the map, drawn grey and dashed when not live.
 */
export default function MapView({ route, vehicles, meId, selectedId, onSelect, command, bottomInset = 0, className = '' }) {
  const el = useRef(null);
  const map = useRef(null);
  const routeLayer = useRef(null);
  const markers = useRef(new Map());
  const sigs = useRef(new Map());
  const didFit = useRef(false);
  const latest = useRef({});
  latest.current = { route, vehicles, bottomInset, onSelect };

  const fit = (animate = true, vehiclesOnly = false) => {
    const m = map.current;
    if (!m) return;
    const pts = [];
    const vpts = latest.current.vehicles.filter((v) => v.location).map((v) => [v.location.lat, v.location.lng]);
    // "Show everyone" zooms to the vehicles; the first view also includes the whole route
    if (!(vehiclesOnly && vpts.length)) latest.current.route?.coords && pts.push(...latest.current.route.coords);
    pts.push(...vpts);
    if (!pts.length) return;
    m.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 40], paddingBottomRight: [40, 40 + latest.current.bottomInset], animate, maxZoom: 16 });
  };

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, center: [22.5, 79], zoom: 5, worldCopyJump: true });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19, subdomains: 'abc' }).addTo(m);
    m.attributionControl.setPosition('topright');
    m.attributionControl.setPrefix(false);
    map.current = m;
    // Far zoomed out, name labels would pile up on a tight convoy: hide them (SOS labels stay).
    const labels = () => el.current?.classList.toggle('cv-hide-labels', m.getZoom() < 11);
    m.on('zoomend', labels);
    labels();
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; markers.current.clear(); sigs.current.clear(); };
  }, []);

  // Planned route, start and destination
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    routeLayer.current?.remove();
    routeLayer.current = null;
    if (!route?.coords?.length) return;
    const g = L.layerGroup();
    L.polyline(route.coords, { color: '#fff', weight: 8, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(g);
    L.polyline(route.coords, { color: '#1F7A72', weight: 4, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(g);
    const first = route.coords[0];
    const last = route.coords[route.coords.length - 1];
    L.marker(first, { icon: placeIcon(MapPin, 'start'), keyboard: false }).bindTooltip(`Start: ${route.start?.label || ''}`).addTo(g);
    L.marker(last, { icon: placeIcon(Flag, 'end'), keyboard: false }).bindTooltip(`Destination: ${route.destination?.label || ''}`).addTo(g);
    g.addTo(m);
    routeLayer.current = g;
    if (!didFit.current) { didFit.current = true; fit(false); }
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vehicles
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set();
    for (const v of vehicles) {
      if (!v.location) continue;
      seen.add(v.id);
      const pos = [v.location.lat, v.location.lng];
      const sig = [v.vehicleType, v.color, v.live, v.status, v.rank, v.offRoute, v.flags.sos, v.vehicleName, v.id === meId, v.id === selectedId, v.simulated].join('|');
      let mk = markers.current.get(v.id);
      if (!mk) {
        mk = L.marker(pos, { icon: vehicleIcon(v, v.id === meId, v.id === selectedId), zIndexOffset: v.id === meId ? 1000 : v.flags.sos ? 2000 : 0, keyboard: false });
        mk.on('click', () => latest.current.onSelect?.(v.id));
        mk.addTo(m);
        markers.current.set(v.id, mk);
        sigs.current.set(v.id, sig);
      } else {
        mk.setLatLng(pos);
        if (sigs.current.get(v.id) !== sig) { mk.setIcon(vehicleIcon(v, v.id === meId, v.id === selectedId)); mk.setZIndexOffset(v.id === meId ? 1000 : v.flags.sos ? 2000 : 0); sigs.current.set(v.id, sig); }
      }
    }
    for (const [id, mk] of markers.current) if (!seen.has(id)) { mk.remove(); markers.current.delete(id); sigs.current.delete(id); }
    if (!didFit.current && seen.size) { didFit.current = true; fit(false); }
  }, [vehicles, meId, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Map buttons
  useEffect(() => {
    const m = map.current;
    if (!m || !command?.type) return;
    if (command.type === 'fit') fit(true, true);
    else if (command.type === 'zoomIn') m.zoomIn();
    else if (command.type === 'zoomOut') m.zoomOut();
    else {
      const v = latest.current.vehicles.find((x) => x.id === (command.type === 'me' ? meId : command.id));
      if (v?.location) {
        // Aim a little above the vehicle so it isn't hidden behind the bottom sheet on phones
        const z = Math.max(m.getZoom(), 15);
        const target = m.unproject(m.project([v.location.lat, v.location.lng], z).add([0, latest.current.bottomInset / 2]), z);
        m.flyTo(target, z, { duration: 0.8 });
      }
    }
  }, [command]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={`h-full w-full ${className}`} role="application" aria-label="Live map of all vehicles in the journey" />;
}

