import { loadSession } from './session.js';

// Empty in normal use (same origin). Set VITE_API_URL if the API is hosted on a different domain.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status, field) { super(message); this.status = status; this.field = field; }
}

async function request(path, { method = 'GET', body, journeyId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const session = journeyId ? loadSession(journeyId) : null;
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('No internet connection. Check your signal and try again.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', res.status, data.field);
  return data;
}

const J = (id) => `/journeys/${id}`;
export const api = {
  createJourney: (body) => request('/journeys', { method: 'POST', body }),
  previewCode: (code) => request(`/journeys/preview/${encodeURIComponent(code)}`),
  joinJourney: (body) => request('/journeys/join', { method: 'POST', body }),
  getJourney: (id) => request(J(id), { journeyId: id }),
  regenerateCode: (id) => request(`${J(id)}/code/regenerate`, { method: 'POST', journeyId: id }),
  setJoinEnabled: (id, enabled) => request(`${J(id)}/code/enabled`, { method: 'POST', body: { enabled }, journeyId: id }),
  leave: (id) => request(`${J(id)}/leave`, { method: 'POST', journeyId: id }),
  saveSettings: (id, body) => request(`${J(id)}/settings`, { method: 'PATCH', body, journeyId: id }),
  changeDestination: (id, destination) => request(`${J(id)}/destination`, { method: 'POST', body: { destination }, journeyId: id }),
  retryRoute: (id) => request(`${J(id)}/route/retry`, { method: 'POST', journeyId: id }),
  removeMember: (id, vehicleId) => request(`${J(id)}/members/${vehicleId}`, { method: 'DELETE', journeyId: id }),
  endJourney: (id) => request(`${J(id)}/end`, { method: 'POST', journeyId: id }),
};
