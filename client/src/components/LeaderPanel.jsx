import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Share2, RefreshCw, PauseCircle, PlayCircle, UserX, Play, Square, Power, RotateCw, Crown, ChevronDown, QrCode, BellRing, Route as RouteIcon, Users, FlaskConical } from 'lucide-react';
import { VehicleIcon } from './VehicleIcon.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { FormError } from './FormShell.jsx';
import { api } from '../api.js';

function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch { window.prompt('Copy this:', text); }
  }
  return (
    <button onClick={copy} className="btn-secondary !px-3">
      {done ? <Check className="h-4 w-4 text-teal" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{done ? 'Copied' : label}
    </button>
  );
}

function Section({ title, Icon, open, children }) {
  return (
    <details open={open} className="card overflow-hidden">
      <summary className="flex min-h-[52px] cursor-pointer items-center gap-3 px-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-light text-teal-dark"><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <span className="flex-1 text-sm font-bold">{title}</span>
        <ChevronDown className="chev h-4 w-4 text-ink-soft transition-transform" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t border-ink/[.07] px-4 py-4">{children}</div>
    </details>
  );
}

export default function LeaderPanel({ journeyId, meta, state, emit, refresh }) {
  const j = meta.journey;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [sep, setSep] = useState(String(j.maxSeparationKm));
  const [stopMin, setStopMin] = useState(String(j.stopAlertMinutes));
  const [dest, setDest] = useState('');

  useEffect(() => { setSep(String(j.maxSeparationKm)); setStopMin(String(j.stopAlertMinutes)); }, [j.maxSeparationKm, j.stopAlertMinutes]);

  async function run(fn, okMsg = '') {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); if (okMsg) setNotice(okMsg); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const socketCall = (event) => new Promise((res, rej) => emit(event, {}, (r) => (r?.ok ? res() : rej(new Error(r?.error || 'Something went wrong.')))));

  const sepNum = Number(sep);
  const sepValid = Number.isFinite(sepNum) && sepNum >= 0.5 && sepNum <= 100;
  const simulation = state.simulation;
  const members = meta.members.filter((m) => !m.simulated);
  const shareText = `Join "${j.name}" on Convoy. Code: ${j.joinCode}\n${j.inviteLink}`;

  return (
    <div className="space-y-2.5 px-3 pb-8 pt-2">
      <FormError message={error} />
      {notice && <p role="status" className="rounded-xl bg-teal-light px-3.5 py-2.5 text-sm font-semibold text-teal-dark">{notice}</p>}

      <Section title="Invite your group" Icon={QrCode} open>
        <div className="flex items-center gap-4">
          <div className="shrink-0 rounded-xl bg-white p-2 ring-1 ring-ink/10">
            <QRCodeSVG value={j.inviteLink} size={104} bgColor="#ffffff" fgColor="#0F1B2D" level="M" title="QR code to join this journey" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-soft">Journey code</p>
            <p className="text-[28px] font-bold leading-tight tracking-[.18em]" aria-label={`Journey code ${j.joinCode.split('').join(' ')}`}>{j.joinCode}</p>
            <p className="mt-0.5 text-xs text-ink-soft">{j.joinEnabled ? `Expires ${new Date(j.joinCodeExpiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Joining is paused'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {navigator.share && <button className="btn-primary !px-3" onClick={() => navigator.share({ title: j.name, text: shareText }).catch(() => {})}><Share2 className="h-4 w-4" aria-hidden="true" />Share</button>}
          <CopyButton text={j.inviteLink} label="Copy link" />
          <CopyButton text={j.joinCode} label="Copy code" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-quiet !px-3 text-[13px]" disabled={busy} onClick={() => run(() => api.setJoinEnabled(journeyId, !j.joinEnabled))}>
            {j.joinEnabled ? <PauseCircle className="h-4 w-4" aria-hidden="true" /> : <PlayCircle className="h-4 w-4" aria-hidden="true" />}{j.joinEnabled ? 'Pause joining' : 'Resume joining'}
          </button>
          <button className="btn-quiet !px-3 text-[13px]" disabled={busy} onClick={() => setConfirm({ kind: 'code' })}><RefreshCw className="h-4 w-4" aria-hidden="true" />New code</button>
        </div>
      </Section>

      <Section title="Alert settings" Icon={BellRing}>
        <div>
          <label htmlFor="sep" className="label">Maximum separation (km)</label>
          <div className="flex flex-wrap gap-1.5">
            {[2, 5, 10, 20].map((n) => (
              <button key={n} onClick={() => setSep(String(n))} aria-pressed={Number(sep) === n} className={`btn !px-3.5 border ${Number(sep) === n ? 'border-teal bg-teal-light text-teal-dark' : 'border-ink/15 bg-white'}`}>{n}</button>
            ))}
            <input id="sep" className="input !w-24" inputMode="decimal" value={sep} onChange={(e) => setSep(e.target.value)} />
          </div>
          <p className="mt-1.5 text-xs text-ink-soft">Everyone is alerted when a vehicle stays this far behind the leader, along the route, for 20 seconds.</p>
        </div>
        <div>
          <label htmlFor="stop" className="label">Alert when a vehicle has stopped for</label>
          <select id="stop" className="input" value={stopMin} onChange={(e) => setStopMin(e.target.value)}>
            {[1, 5, 10, 15, 30].map((n) => <option key={n} value={n}>{n} minute{n > 1 ? 's' : ''}</option>)}
          </select>
        </div>
        {!sepValid && <p className="text-[13px] font-semibold text-alert">Enter a distance between 0.5 and 100 km.</p>}
        <button className="btn-primary w-full" disabled={busy || !sepValid} onClick={() => run(() => api.saveSettings(journeyId, { maxSeparationKm: sepNum, stopAlertMinutes: Number(stopMin) }), 'Settings saved.')}>Save settings</button>
      </Section>

      <Section title="Route and destination" Icon={RouteIcon}>
        <p className="text-sm"><b>To:</b> {j.destination.label}</p>
        {j.destination.resolved && <p className="text-xs text-ink-soft">Matched to: {j.destination.resolved}</p>}
        {j.routeStatus === 'ok'
          ? <p className="text-[13px] text-ink-soft">Route loaded · {Math.round((j.routeDistanceM || 0) / 1000)} km</p>
          : <><FormError message={j.routeError || 'No route is loaded.'} /><button className="btn-secondary" disabled={busy} onClick={() => run(() => api.retryRoute(journeyId), 'Route loaded.')}><RotateCw className="h-4 w-4" aria-hidden="true" />Retry route</button></>}
        <div>
          <label htmlFor="dest" className="label">Change destination</label>
          <div className="flex gap-2">
            <input id="dest" className="input" placeholder="New destination" value={dest} onChange={(e) => setDest(e.target.value)} />
            <button className="btn-primary shrink-0" disabled={busy || !dest.trim()} onClick={() => run(async () => { await api.changeDestination(journeyId, dest.trim()); setDest(''); }, 'Destination and route updated.')}>Update</button>
          </div>
          <p className="mt-1.5 text-xs text-ink-soft">The route is recalculated from the original starting point.</p>
        </div>
      </Section>

      <Section title={`People (${members.length})`} Icon={Users}>
        <ul className="-my-1 divide-y divide-ink/[.07]">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white" style={{ background: m.color }}><VehicleIcon type={m.vehicleType} /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-semibold">{m.vehicleName}{m.isLeader && <Crown className="h-3.5 w-3.5 text-teal" aria-label="Leader" />}</p>
                <p className="truncate text-xs text-ink-soft">{m.driverName}</p>
              </div>
              {!m.isLeader && <button className="btn-quiet !px-3 text-[13px] text-alert" onClick={() => setConfirm({ kind: 'remove', m })} aria-label={`Remove ${m.driverName}`}><UserX className="h-4 w-4" aria-hidden="true" />Remove</button>}
            </li>
          ))}
        </ul>
      </Section>

      {simulation?.allowed && (
        <Section title="Testing mode" Icon={FlaskConical}>
          <p className="text-[13px] text-ink-soft">Adds 7 <b className="text-ink">simulated</b> vehicles that drive your route so you can see ordering, a vehicle falling behind, a wrong turn, a stop and a lost connection. They’re fake (no real GPS) and labelled SIM for everyone.</p>
          {simulation.running
            ? <button className="btn-secondary w-full" disabled={busy} onClick={() => run(() => socketCall('sim:stop'))}><Square className="h-4 w-4" aria-hidden="true" />Stop testing mode</button>
            : <button className="btn-secondary w-full" disabled={busy || j.routeStatus !== 'ok'} onClick={() => run(() => socketCall('sim:start'))}><Play className="h-4 w-4" aria-hidden="true" />Start testing mode</button>}
          {j.routeStatus !== 'ok' && <p className="text-xs text-ink-soft">Needs a loaded route.</p>}
          <p className="text-xs text-ink-soft">Tip: set the maximum separation to 2 km and the stopped alert to 1 minute to see those alerts sooner.</p>
        </Section>
      )}

      <div className="pt-2">
        <button className="btn-danger w-full" onClick={() => setConfirm({ kind: 'end' })}><Power className="h-4 w-4" aria-hidden="true" />End journey for everyone</button>
      </div>

      <ConfirmDialog open={confirm?.kind === 'code'} title="Make a new code?" confirmLabel="Make new code" onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); run(() => api.regenerateCode(journeyId)); }}>
        <p>The current code, link and QR code stop working straight away. People already in the journey stay in.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm?.kind === 'remove'} danger title={`Remove ${confirm?.m?.driverName}?`} confirmLabel="Remove" onCancel={() => setConfirm(null)}
        onConfirm={() => { const id = confirm.m.id; setConfirm(null); run(() => api.removeMember(journeyId, id)); }}>
        <p>{confirm?.m?.vehicleName} is disconnected and stops sharing location. They can only return with a new code.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm?.kind === 'end'} danger title="End this journey for everyone?" confirmLabel="End journey" onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); run(() => api.endJourney(journeyId)); }}>
        <p>Everyone is disconnected and location sharing stops. This can’t be undone.</p>
      </ConfirmDialog>
    </div>
  );
}
