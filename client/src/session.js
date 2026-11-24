// A journey session is just { token, me } kept in this browser. No account needed.
const key = (journeyId) => `convoy:session:${journeyId}`;
const LAST = 'convoy:last-journey';

export function saveSession(journeyId, session) {
  try {
    localStorage.setItem(key(journeyId), JSON.stringify(session));
    localStorage.setItem(LAST, journeyId);
  } catch { /* private mode: the session simply won't survive a reload */ }
}

export function loadSession(journeyId) {
  try { return JSON.parse(localStorage.getItem(key(journeyId))); } catch { return null; }
}

export function clearSession(journeyId) {
  try {
    localStorage.removeItem(key(journeyId));
    if (localStorage.getItem(LAST) === journeyId) localStorage.removeItem(LAST);
  } catch { /* ignore */ }
}

export const lastJourneyId = () => { try { return localStorage.getItem(LAST); } catch { return null; } };
