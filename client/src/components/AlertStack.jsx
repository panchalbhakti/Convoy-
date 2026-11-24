import { useEffect, useMemo, useState } from 'react';
import { Siren, AlertTriangle, Route as RouteIcon, PauseCircle, X, MapPin } from 'lucide-react';
import { formatAgo, formatDistance } from '../lib/format.js';

/** One compact banner for the most important live problem; the rest are counted and listed under Trip. */
export default function AlertStack({ state, meId, isLeader, now, onShow, onCancelSos, onMore }) {
  const [dismissed, setDismissed] = useState(() => new Set());

  const items = useMemo(() => {
    const out = [];
    for (const v of state.vehicles) {
      const ago = v.lastUpdatedAt ? formatAgo((now - v.lastUpdatedAt) / 1000) : null;
      if (v.flags.sos) out.push({ key: `sos:${v.id}`, v, Icon: Siren, tone: 'sos', title: `SOS from ${v.driverName}`,
        text: v.location ? `${v.vehicleName} · location updated ${ago}` : `${v.vehicleName} · no location available`, cta: 'Show' });
      if (v.flags.separated) out.push({ key: `sep:${v.id}`, v, Icon: AlertTriangle, tone: 'warn', title: 'Group Separation Alert!',
        text: v.gapToLeaderM != null ? `${v.vehicleName} is currently ${formatDistance(v.gapToLeaderM)} behind the leading vehicle.` : `${v.vehicleName} has fallen behind the group.`, cta: 'Show' });
      if (v.flags.offRoute) out.push({ key: `dev:${v.id}`, v, Icon: RouteIcon, tone: 'warn', title: 'Route Deviation Detected!',
        text: `${v.vehicleName} appears to have moved away from the planned route.${ago ? ` Last known location ${ago}.` : ''}`, cta: isLeader ? 'Check' : 'Show' });
      if (v.flags.stoppedLong) {
        const mins = Math.max(1, Math.floor((v.stoppedForMs ?? state.settings.stopAlertMs) / 60000));
        out.push({ key: `stop:${v.id}`, v, Icon: PauseCircle, tone: 'warn', title: 'Vehicle stopped',
          text: `${v.vehicleName} has been stopped for ${mins} minute${mins > 1 ? 's' : ''}.`, cta: 'Show' });
      }
    }
    return out.sort((a, b) => (b.tone === 'sos') - (a.tone === 'sos'));
  }, [state, now, isLeader]);

  useEffect(() => {
    const live = new Set(items.map((i) => i.key));
    setDismissed((d) => { const n = new Set([...d].filter((k) => live.has(k))); return n.size === d.size ? d : n; });
  }, [items]);

  const sosKey = items.filter((i) => i.tone === 'sos').map((i) => i.key).join(',');
  useEffect(() => { if (sosKey && navigator.vibrate) navigator.vibrate([300, 150, 300]); }, [sosKey]);

  const visible = items.filter((i) => i.tone === 'sos' || !dismissed.has(i.key));
  if (!visible.length) return null;
  const { key, v, Icon, tone, title, text, cta } = visible[0];
  const more = visible.length - 1;
  const sos = tone === 'sos';
  return (
    <div role="alert" aria-live="assertive" className={`pointer-events-auto flex items-start gap-2.5 rounded-2xl p-2.5 shadow-float ${sos ? 'bg-alert text-white' : 'border border-amber-300 bg-white text-ink'}`}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${sos ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight">{title}</p>
        <p className={`mt-0.5 text-[13px] leading-snug ${sos ? 'text-white/90' : 'text-ink-soft'}`}>{text}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {v.location && <button onClick={() => onShow(v.id)} className={`btn !min-h-[40px] !px-3 text-[13px] ${sos ? 'bg-white text-alert' : 'bg-ink text-white'}`}><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{cta} on map</button>}
          {sos && (v.id === meId || isLeader) && <button onClick={() => onCancelSos(v.id)} className="btn !min-h-[40px] border border-white/60 !px-3 text-[13px] text-white">{v.id === meId ? 'Cancel my SOS' : 'Clear SOS'}</button>}
          {more > 0 && <button onClick={onMore} className={`text-xs font-semibold underline underline-offset-2 ${sos ? 'text-white' : 'text-ink-soft'}`}>+{more} more</button>}
        </div>
      </div>
      {!sos && <button onClick={() => setDismissed((d) => new Set(d).add(key))} aria-label="Dismiss alert" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-ink/5"><X className="h-4 w-4" /></button>}
    </div>
  );
}
