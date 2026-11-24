export function formatDistance(m) {
  if (m == null || !Number.isFinite(m)) return '–';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  const km = m / 1000;
  return km >= 100 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

export function formatAgo(sec) {
  if (sec == null || !Number.isFinite(sec)) return 'never';
  if (sec < 5) return 'just now';
  if (sec < 60) return `${Math.floor(sec)} s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  return `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min ago`;
}

export function formatDuration(ms) {
  if (ms == null || ms < 0) return '–';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'under 1 min';
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}

export const formatClock = (ts) =>
  ts ? new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '–';
