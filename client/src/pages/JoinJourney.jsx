import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LogIn, MapPin } from 'lucide-react';
import FormShell, { FormError } from '../components/FormShell.jsx';
import Field from '../components/Field.jsx';
import { VehiclePicker } from '../components/VehicleIcon.jsx';
import { api } from '../api.js';
import { saveSession } from '../session.js';

export default function JoinJourney() {
  const nav = useNavigate();
  const { code: codeParam } = useParams();
  const [code, setCode] = useState((codeParam || '').toUpperCase());
  const [preview, setPreview] = useState(null);
  const [f, setF] = useState({ driverName: '', vehicleName: '', vehicleType: 'car' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // When the code is complete (typed, or from a link/QR), show what the person is about to join
  useEffect(() => {
    setPreview(null);
    if (!/^[A-Z0-9]{6}$/.test(code)) return;
    let live = true;
    api.previewCode(code)
      .then((p) => { if (live) { setPreview(p); setError(''); } })
      .catch((err) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [code]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token, me, journey } = await api.joinJourney({ code, ...f });
      saveSession(journey.journeyId, { token, me });
      nav(`/journey/${journey.journeyId}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <FormShell title="Join a journey" intro="Enter the 6-character code from your Journey Leader. If you scanned a QR code or opened a link, it’s already filled in.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field
          label="Journey code"
          placeholder="K7M2QX"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          autoCapitalize="characters" autoComplete="off" spellCheck="false" inputMode="text" maxLength={6}
          style={{ letterSpacing: '0.3em', fontWeight: 800, fontSize: '1.25rem' }}
          required
        />
        {preview && (
          <div className="flex items-start gap-3 rounded-xl bg-teal-light p-4 text-teal-dark">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-bold">{preview.name}</p>
              <p className="text-sm">{preview.start} to {preview.destination}</p>
            </div>
          </div>
        )}
        <hr className="border-ink/10" />
        <Field label="Your name" placeholder="Driver or passenger name" value={f.driverName} onChange={set('driverName')} required />
        <Field label="Vehicle name or number" placeholder="White Swift, GJ 27 CD 5678" value={f.vehicleName} onChange={set('vehicleName')} required />
        <VehiclePicker value={f.vehicleType} onChange={(v) => setF((s) => ({ ...s, vehicleType: v }))} />
        <FormError message={error} />
        <button className="btn-primary w-full" disabled={busy || !preview}><LogIn className="h-5 w-5" aria-hidden="true" />{busy ? 'Joining…' : 'Join journey'}</button>
      </form>
    </FormShell>
  );
}
