import { Volume2, ArrowRight, Siren, AlertTriangle, Route as RouteIcon, PauseCircle, Info, LogOut, CheckCircle2 } from 'lucide-react';
import { formatClock, formatDistance, formatDuration } from '../lib/format.js';

const ALERT_ICON = { sos: Siren, separation: AlertTriangle, deviation: RouteIcon, stopped: PauseCircle, info: CheckCircle2 };

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-paper px-3 py-2.5">
      <p className="text-[11px] font-medium text-ink-soft">{label}</p>
      <p className="mt-0.5 text-[15px] font-bold leading-tight">{value}</p>
    </div>
  );
}

export default function JourneyPanel({ meta, state, alerts, now, isLeader, onLeave, onTestAlarm }) {
  const j = meta.journey;
  const info = state.info;
  const pct = info.totalM && info.travelledM != null ? Math.min(100, Math.round((info.travelledM / info.totalM) * 100)) : null;
  return (
    <div className="space-y-4 px-3 pb-6 pt-2">
      <section className="card p-4" aria-label="Journey overview">
        <h2 className="text-base font-bold">{j.name}</h2>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-soft">
          <span className="truncate">{j.start.label}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate font-semibold text-ink">{j.destination.label}</span>
        </p>
        <div className="mt-4" role="group" aria-label="Group progress">
          <div className="mb-1.5 flex justify-between text-xs font-semibold"><span>Group progress</span><span>{pct != null ? `${pct}%` : '–'}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0}>
            <div className="h-full rounded-full bg-teal transition-[width] duration-700" style={{ width: `${pct ?? 0}%` }} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Vehicles" value={`${info.vehicleCount}`} />
          <Stat label="Travelled" value={formatDistance(info.travelledM)} />
          <Stat label="Remaining" value={info.arrived ? 'Arrived' : formatDistance(info.remainingM)} />
          <Stat label="Total" value={formatDistance(info.totalM)} />
          <Stat label="ETA (est.)" value={info.arrived ? 'Arrived' : info.etaAt ? formatClock(info.etaAt) : '–'} />
          <Stat label="Time on road" value={info.startedAt ? formatDuration(now - info.startedAt) : 'Not started'} />
        </div>
      </section>

      <section aria-label="Notifications">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Notifications</h2>
        {alerts.length === 0 ? (
          <p className="flex gap-2 rounded-2xl bg-sand p-3 text-[13px] font-medium"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Nothing yet. Separation, route and stopped alerts will show up here.</p>
        ) : (
          <ul className="space-y-1.5">
            {[...alerts].reverse().map((a) => {
              const Icon = ALERT_ICON[a.type] || Info;
              const crit = a.severity === 'critical';
              return (
                <li key={a.id} className={`flex gap-2.5 rounded-xl border px-3 py-2.5 ${crit ? 'border-alert/30 bg-red-50' : a.severity === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-ink/[.07] bg-white'}`}>
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${crit ? 'text-alert' : 'text-ink-soft'}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold leading-tight">{a.title} <span className="font-normal text-ink-soft">· {formatClock(a.at)}</span></p>
                    <p className="text-[13px] text-ink-soft">{a.message}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <button className="btn-secondary w-full" onClick={onTestAlarm}><Volume2 className="h-4 w-4" aria-hidden="true" />Test SOS alarm sound (3 s)</button>
      {!isLeader && <button className="btn-secondary w-full" onClick={onLeave}><LogOut className="h-4 w-4" aria-hidden="true" />Leave journey</button>}
      <p className="px-1 text-xs text-ink-soft">Keep Convoy open while travelling; phones may pause location when the screen locks. Never use your phone while driving.</p>
    </div>
  );
}
