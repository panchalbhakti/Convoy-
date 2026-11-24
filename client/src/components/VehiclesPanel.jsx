import { Crown, Siren, AlertTriangle, Route as RouteIcon, PauseCircle, FlaskConical, Info, ChevronDown } from 'lucide-react';
import { VehicleIcon } from './VehicleIcon.jsx';
import { STATUS } from './StatusBadge.jsx';
import { formatAgo, formatDistance } from '../lib/format.js';
import { haversine } from '../lib/geo.js';

function relation(me, v) {
  // Distance from the user's vehicle, kept separate: along the route vs straight line
  if (!me || me.id === v.id) return null;
  return {
    straight: me.location && v.location ? haversine(me.location, v.location) : null,
    routeM: me.progressM != null && v.progressM != null ? v.progressM - me.progressM : null,
  };
}

export function Avatar({ v, size = 36 }) {
  return (
    <span className="relative grid shrink-0 place-items-center rounded-full text-white" style={{ width: size, height: size, background: v.live ? v.color : '#8E96A4' }}>
      <VehicleIcon type={v.vehicleType} className={size > 32 ? 'h-[18px] w-[18px]' : 'h-4 w-4'} />
      {v.rank && <span className="absolute -bottom-1 -right-1 grid h-[17px] min-w-[17px] place-items-center rounded-full border-2 border-white bg-ink px-0.5 text-[10px] font-bold leading-none">{v.rank}</span>}
    </span>
  );
}

function Flag({ Icon, children, cls }) {
  return <span className={`chip ${cls}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{children}</span>;
}

function Fact({ label, children }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-ink-soft">{label}</dt>
      <dd className="text-[13px] font-semibold">{children}</dd>
    </div>
  );
}

function VehicleRow({ v, me, now, open, onSelect }) {
  const isMe = me?.id === v.id;
  const rel = relation(me, v);
  const ageSec = v.lastUpdatedAt ? (now - v.lastUpdatedAt) / 1000 : null;
  const st = STATUS[v.status] || STATUS.unavailable;
  const stopMin = v.stoppedForMs != null ? Math.max(1, Math.floor(v.stoppedForMs / 60000)) : null;
  const right = v.rank === 1 ? <span className="text-[13px] font-bold text-teal-dark">Leading</span>
    : v.rank ? <><span className="text-[13px] font-bold">{formatDistance(v.gapAheadM)}</span><span className="block text-[11px] text-ink-soft">behind #{v.rank - 1}</span></>
    : <span className="text-[13px] font-semibold text-ink-soft">–</span>;
  return (
    <li className={`overflow-hidden rounded-2xl border bg-white transition-colors ${v.flags.sos ? 'border-alert' : open ? 'border-teal/50' : 'border-ink/[.07]'}`}>
      <button onClick={() => onSelect(v.id)} aria-expanded={open} className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left">
        <Avatar v={v} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <b className="truncate text-sm font-semibold">{v.vehicleName}</b>
            {isMe && <span className="chip !px-1.5 !py-0 bg-sand text-[11px]">You</span>}
            {v.isLeader && <Crown className="h-3.5 w-3.5 shrink-0 text-teal" aria-label="Journey leader" />}
            {v.simulated && <span className="chip !px-1.5 !py-0 bg-ink text-[10px] text-white"><FlaskConical className="h-3 w-3" aria-hidden="true" />SIM</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
            <st.Icon className={`h-3.5 w-3.5 shrink-0 ${st.text}`} aria-hidden="true" />
            <span className={`font-semibold ${st.text}`}>{st.short}</span>
            <span className="truncate">· {v.location ? formatAgo(ageSec) : 'no location'}</span>
          </span>
        </span>
        <span className="text-right leading-tight">{right}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="border-t border-ink/[.07] bg-paper/60 px-3 py-3">
          <p className="mb-2 text-xs text-ink-soft">{v.driverName}{v.speedKmh != null && ` · ${v.speedKmh} km/h`}</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {v.flags.sos && <Flag Icon={Siren} cls="bg-alert text-white">SOS</Flag>}
            {v.flags.separated && <Flag Icon={AlertTriangle} cls="bg-amber-100 text-amber-900">Falling behind</Flag>}
            {v.offRoute && <Flag Icon={RouteIcon} cls="bg-amber-100 text-amber-900">Off route</Flag>}
            {v.flags.stoppedLong && stopMin != null && <Flag Icon={PauseCircle} cls="bg-amber-100 text-amber-900">Stopped {stopMin} min</Flag>}
          </div>
          {!v.live && v.statusReason && <p className="mb-2 text-xs font-medium text-ink-soft">{v.statusReason}{v.location ? '. The map shows its last known position, not a live one.' : '.'}</p>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {v.rank > 1 && <Fact label="Behind the leader (route)">{formatDistance(v.gapToLeaderM)}</Fact>}
            {v.rank > 1 && v.straightAheadM != null && <Fact label={`To #${v.rank - 1} (straight line)`}>{formatDistance(v.straightAheadM)}</Fact>}
            {rel?.routeM != null && <Fact label="From you (route)">{formatDistance(Math.abs(rel.routeM))} {rel.routeM > 0 ? 'ahead' : 'behind'}</Fact>}
            {rel?.straight != null && <Fact label="From you (straight line)">{formatDistance(rel.straight)}</Fact>}
            <Fact label="Last update">{v.location ? formatAgo(ageSec) : '–'}</Fact>
            {v.location?.accuracy != null && <Fact label="GPS accuracy">±{Math.round(v.location.accuracy)} m</Fact>}
          </dl>
        </div>
      )}
    </li>
  );
}

export default function VehiclesPanel({ state, meId, selectedId, onSelect, now }) {
  const vehicles = state.vehicles;
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const me = byId.get(meId);
  const { order } = state;
  const ranked = vehicles.filter((v) => v.rank).sort((a, b) => a.rank - b.rank);
  const others = vehicles.filter((v) => !v.rank);

  let meNote = null;
  if (me && !me.rank) {
    if (!me.live) meNote = 'Share your location to see your place in the group and how far the others are.';
    else if (me.offRoute) meNote = 'You seem to be off the planned route, so your place in the order isn’t shown.';
    else if (me.lowAccuracy) meNote = 'Your GPS accuracy is too low to place you in the order.';
  }

  const ahead = me?.rank > 1 ? byId.get(order.ranked[me.rank - 2]) : null;
  const behind = me?.rank && me.rank < order.ranked?.length ? byId.get(order.ranked[me.rank]) : null;

  return (
    <div className="space-y-4 px-3 pb-6 pt-2">
      {order.ok ? (
        <section aria-label="Group summary" className="card p-3.5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-[11px] font-medium text-ink-soft">Leading</p><p className="truncate text-sm font-bold">{byId.get(order.leaderId)?.vehicleName}</p></div>
            <div><p className="text-[11px] font-medium text-ink-soft">Last</p><p className="truncate text-sm font-bold">{order.ranked.length > 1 ? byId.get(order.lastId)?.vehicleName : '–'}</p></div>
            <div><p className="text-[11px] font-medium text-ink-soft">Spread (route)</p><p className="text-sm font-bold">{order.ranked.length > 1 ? formatDistance(order.separationM) : '–'}</p></div>
          </div>
          {me?.rank && order.ranked.length > 1 && (
            <p className="mt-3 border-t border-ink/[.07] pt-2.5 text-[13px] text-ink-soft">
              {ahead ? <>Ahead: <b className="text-ink">{ahead.vehicleName}</b>, {formatDistance(Math.max(0, ahead.progressM - me.progressM))}. </> : <b className="text-teal-dark">You’re leading. </b>}
              {behind ? <>Behind: <b className="text-ink">{behind.vehicleName}</b>, {formatDistance(Math.max(0, me.progressM - behind.progressM))}.</> : <b className="text-ink">You’re last.</b>}
            </p>
          )}
        </section>
      ) : (
        <p className="flex gap-2 rounded-2xl bg-sand p-3 text-[13px] font-medium"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{order.message}</p>
      )}
      {order.ok && order.message && <p className="text-xs text-ink-soft">{order.message}</p>}
      {meNote && <p className="text-[13px] font-medium text-ink-soft">{meNote}</p>}

      <section aria-label="Vehicles">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">In order · {ranked.length}</h2>
        <ul className="space-y-2">
          {ranked.map((v) => <VehicleRow key={v.id} v={v} me={me} now={now} open={v.id === selectedId} onSelect={onSelect} />)}
          {!ranked.length && <li className="px-1 text-[13px] text-ink-soft">No vehicle has a reliable position on the route yet.</li>}
        </ul>
        {others.length > 0 && (
          <>
            <h2 className="mb-2 mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Not in the order · {others.length}</h2>
            <ul className="space-y-2">{others.map((v) => <VehicleRow key={v.id} v={v} me={me} now={now} open={v.id === selectedId} onSelect={onSelect} />)}</ul>
          </>
        )}
      </section>

      <details className="rounded-2xl border border-ink/[.07] bg-white px-3.5 py-2.5 text-[13px] text-ink-soft">
        <summary className="flex min-h-[28px] cursor-pointer items-center justify-between font-semibold text-ink">How distances work<ChevronDown className="chev h-4 w-4 transition-transform" aria-hidden="true" /></summary>
        <p className="mt-2"><b className="text-ink">By route</b> is measured along the planned road. <b className="text-ink">Straight line</b> is the direct distance between two GPS positions. They differ on winding roads. Vehicles that are off the route or have poor GPS are left out of the order.</p>
      </details>
    </div>
  );
}
