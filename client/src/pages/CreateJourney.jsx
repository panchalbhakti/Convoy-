import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import FormShell, { FormError } from '../components/FormShell.jsx';
import Field from '../components/Field.jsx';
import { VehiclePicker } from '../components/VehicleIcon.jsx';
import { api } from '../api.js';
import { saveSession } from '../session.js';

const today = () => new Date().toISOString().slice(0, 10);

export default function CreateJourney() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', start: '', destination: '', journeyDate: today(), vehicleType: 'car', vehicleName: '', driverName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token, me, journey } = await api.createJourney(f);
      saveSession(journey.journeyId, { token, me });
      nav(`/journey/${journey.journeyId}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <FormShell title="Start a journey" intro="You’ll be the Journey Leader. After this, you can share a code, link and QR code with everyone travelling.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Journey name" placeholder="Udaipur family trip" value={f.name} onChange={set('name')} required />
        <Field label="Starting location" placeholder="Ahmedabad" value={f.start} onChange={set('start')} required hint="A city or place name. We plan the driving route for you." />
        <Field label="Destination" placeholder="Udaipur" value={f.destination} onChange={set('destination')} required />
        <Field label="Journey date" type="date" min={today()} value={f.journeyDate} onChange={set('journeyDate')} required />
        <hr className="border-ink/10" />
        <p className="text-sm font-bold text-ink-soft">Your vehicle</p>
        <VehiclePicker value={f.vehicleType} onChange={(v) => setF((s) => ({ ...s, vehicleType: v }))} />
        <Field label="Vehicle name or number" placeholder="Red Innova, GJ 01 AB 1234" value={f.vehicleName} onChange={set('vehicleName')} required />
        <Field label="Driver name" placeholder="Your name" value={f.driverName} onChange={set('driverName')} required />
        <FormError message={error} />
        <button className="btn-primary w-full" disabled={busy}><Rocket className="h-5 w-5" aria-hidden="true" />{busy ? 'Planning your route…' : 'Create journey'}</button>
      </form>
    </FormShell>
  );
}
