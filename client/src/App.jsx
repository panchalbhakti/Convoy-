import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import CreateJourney from './pages/CreateJourney.jsx';
import JoinJourney from './pages/JoinJourney.jsx';

// The map, Leaflet and the realtime client only load once someone opens a journey.
const Journey = lazy(() => import('./pages/Journey.jsx'));

export default function App() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center font-semibold text-ink-soft">Loading…</div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/create" element={<CreateJourney />} />
        <Route path="/join" element={<JoinJourney />} />
        <Route path="/join/:code" element={<JoinJourney />} />
        <Route path="/journey/:journeyId" element={<Journey />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
