import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Siren, Radio, Square, LocateFixed, Maximize2, Plus, Minus, WifiOff, FlaskConical, Route as RouteIcon, MapPinOff, Crosshair } from 'lucide-react';
import { LogoMark } from '../components/Logo.jsx';
import MapView from '../components/MapView.jsx';
import BottomSheet from '../components/BottomSheet.jsx';
import VehiclesPanel from '../components/VehiclesPanel.jsx';
import VehicleChips from '../components/VehicleChips.jsx';
import JourneyPanel from '../components/JourneyPanel.jsx';
import LeaderPanel from '../components/LeaderPanel.jsx';
import AlertStack from '../components/AlertStack.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { api } from '../api.js';
import { clearSession } from '../session.js';
import { useJourneySocket } from '../hooks/useJourneySocket.js';
import { useLocationSharing } from '../hooks/useLocationSharing.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useNow } from '../hooks/useNow.js';
import { formatDistance } from '../lib/format.js';

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10 < 4 ? n % 10 : 0]}`;
const CONSENT_KEY = (id) => `convoy:consent:${id}`;

function FullMessage({ title, children, action }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="card max-w-sm p-6 text-center">
        <div className="flex justify-center"><LogoMark size={40} /></div>
        <h1 className="mt-4 text-xl font-bold">{title}</h1>
        <div className="mt-1.5 space-y-2 text-sm text-ink-soft">{children}</div>
        {action}
      </div>
    </div>
  );
}

function StatusChip({ Icon, tone = 'info', live, onClick, children }) {
  const tones = {
    info: 'bg-white text-ink border-ink/10',
    ok: 'bg-teal-light text-teal-dark border-teal/25',
    warn: 'bg-amber-50 text-amber-900 border-amber-300',
  };
  const cls = `pointer-events-auto inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold shadow-card ${tones[tone]}`;
  const icon = live ? <span className="dot-live h-2 w-2 rounded-full bg-teal text-teal" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />;
  return onClick
    ? <button onClick={onClick} className={cls}>{icon}{children}</button>
    : <span role="status" className={cls}>{icon}{children}</span>;
}

function CtrlButton({ Icon, label, onClick, caption = true }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className="flex h-11 w-11 flex-col items-center justify-center rounded-2xl border border-ink/[.08] bg-white text-ink shadow-float transition-all hover:bg-sand active:scale-95">
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      {caption && <span className="mt-0.5 text-[9px] font-bold leading-none">{label}</span>}
    </button>
  );
}

function Peek({ state, meId, selectedId, onSelect }) {
  const me = state.vehicles.find((v) => v.id === meId);
  const { order } = state;
  const title = me?.rank ? `You are ${ordinal(me.rank)} of ${order.ranked.length}` : me?.live ? 'Finding your place…' : 'Not sharing your location';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2">
        <p className="text-[15px] font-bold">{title}</p>
        {order.ok && order.ranked.length > 1
          ? <p className="text-xs text-ink-soft">Spread <b className="text-ink">{formatDistance(order.separationM)}</b> by route</p>
          : <p className="truncate text-xs text-ink-soft">{order.ok ? '' : 'Order unavailable'}</p>}
      </div>
      <VehicleChips state={state} meId={meId} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}

export default function Journey() {
  const { journeyId } = useParams();
  const nav = useNavigate();
  const isWide = useMediaQuery('(min-width: 768px)');
  const sock = useJourneySocket(journeyId);
  const share = useLocationSharing({ emit: sock.emit, journeyId, online: sock.conn === 'online' });
  const now = useNow(1000);

  const [meta, setMeta] = useState(null);
  const [tab, setTab] = useState('vehicles');
  const [sheet, setSheet] = useState('peek');
  const [sheetH, setSheetH] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [cmd, setCmd] = useState({ type: null, n: 0 });
  const [dlg, setDlg] = useState(null); // 'consent' | 'sos' | 'leave'
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setMeta(await api.getJourney(journeyId)); } catch (e) { if (e.status === 401 || e.status === 403) clearSession(journeyId); }
  }, [journeyId]);
  const vehicleCount = sock.state?.vehicles.length;
  useEffect(() => { refresh(); }, [refresh, vehicleCount]);

  useEffect(() => { if (sock.fatal === 'unauthorized') nav('/join', { replace: true }); }, [sock.fatal, nav]);
  useEffect(() => { if (sock.fatal && sock.fatal !== 'unauthorized' && share.status === 'sharing') share.stop(); }, [sock.fatal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (meta) document.title = `${meta.journey.name} – Convoy`; }, [meta]);
  useEffect(() => { if (share.resumed) setNotice('Location sharing resumed'); }, [share.resumed]);
  useEffect(() => { if (!notice) return undefined; const t = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(t); }, [notice]);

  const send = (type, extra = {}) => setCmd((c) => ({ type, n: c.n + 1, ...extra }));
  const selectVehicle = (id) => {
    setSelectedId((cur) => (cur === id && tab === 'vehicles' && sheet !== 'peek' ? null : id));
    send('focus', { id });
  };
  const showMe = () => {
    const me = sock.state?.vehicles.find((v) => v.id === meta?.me.id);
    if (me?.location) send('me'); else setNotice('Your vehicle isn’t on the map yet. Tap Share location.');
  };
  const onShareClick = () => {
    if (share.status === 'sharing' || share.status === 'starting') { share.stop(); return; }
    if (sessionStorage.getItem(CONSENT_KEY(journeyId))) share.start(); else setDlg('consent');
  };

  const sheetOpen = !isWide && sheet !== 'peek';
  const sheetFull = !isWide && sheet === 'full';
  const bottomInset = isWide ? 0 : sheetH;
  const ready = sock.ready && meta && sock.state;
  const isLeader = !!meta?.me.isLeader;
  const meId = meta?.me.id;
  const me = useMemo(() => sock.state?.vehicles.find((v) => v.id === meId), [sock.state, meId]);
  const hasSim = !!sock.state?.vehicles.some((v) => v.simulated);

  if (sock.fatal === 'ended') {
    return <FullMessage title="This journey has ended" action={<Link to="/" onClick={() => clearSession(journeyId)} className="btn-primary mt-5 w-full">Back to home</Link>}>
      <p>The Journey Leader ended it. Location sharing has stopped and live positions were cleared.</p></FullMessage>;
  }
  if (sock.fatal === 'removed') {
    return <FullMessage title="You were removed from this journey" action={<Link to="/" onClick={() => clearSession(journeyId)} className="btn-primary mt-5 w-full">Back to home</Link>}>
      <p>The Journey Leader removed you and your location sharing has stopped. To return, ask for a new code.</p></FullMessage>;
  }
  if (!ready) {
    return <FullMessage title={sock.conn === 'offline' ? 'Can’t connect right now' : 'Opening your journey…'}>
      <p>{sock.conn === 'offline' ? 'Check your internet connection. We’ll keep trying.' : 'Connecting to your group.'}</p></FullMessage>;
  }

  const { state } = sock;
  const sharing = share.status === 'sharing' || share.status === 'starting';
  const blocked = ['denied', 'unsupported', 'insecure'].includes(share.status);

  const tabs = [['vehicles', 'Vehicles'], ['trip', 'Trip'], ...(isLeader ? [['leader', 'Leader']] : [])];
  const panel = (
    <>
      <div className="sticky top-0 z-10 bg-paper px-3 pb-1 pt-1">
        <div role="tablist" aria-label="Journey sections" className="grid gap-1 rounded-xl bg-sand p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`min-h-[40px] rounded-lg text-[13px] font-semibold transition-colors ${tab === id ? 'bg-white text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}>{label}</button>
          ))}
        </div>
      </div>
      {tab === 'vehicles' && <VehiclesPanel state={state} meId={meId} selectedId={selectedId} onSelect={selectVehicle} now={now} />}
      {tab === 'trip' && <JourneyPanel meta={meta} state={state} alerts={sock.alerts} now={now} isLeader={isLeader} onLeave={() => setDlg('leave')} />}
      {tab === 'leader' && isLeader && <LeaderPanel journeyId={journeyId} meta={meta} state={state} emit={sock.emit} refresh={refresh} />}
    </>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-paper">
      <header className="pt-safe z-[1300] flex shrink-0 items-center gap-3 border-b border-ink/[.08] bg-white/95 px-4 py-2 backdrop-blur-md">
        <Link to="/" aria-label="Convoy home" className="shrink-0 transition-opacity hover:opacity-80"><LogoMark size={32} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold leading-tight">{meta.journey.name}</h1>
          <p className="flex items-center gap-1.5 truncate text-xs text-ink-soft">
            <span className={`h-2 w-2 rounded-full transition-colors ${sock.conn === 'online' ? 'bg-teal' : 'bg-amber-500'}`} aria-hidden="true" />
            {sock.conn === 'online' ? `${state.info.liveCount} of ${state.info.vehicleCount} live` : 'Offline · reconnecting'}
          </p>
        </div>
        <button onClick={() => setDlg('sos')} disabled={me?.flags.sos} className="btn-danger !min-h-[42px] !px-4 shadow-sm" aria-label="Send an SOS to the group">
          <Siren className="h-4 w-4" aria-hidden="true" />{me?.flags.sos ? 'SOS sent' : 'SOS'}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {isWide && <aside aria-label="Journey details" className="w-[380px] shrink-0 overflow-y-auto border-r border-ink/[.08] bg-paper lg:w-[420px]">{panel}</aside>}

        <div className="relative min-w-0 flex-1">
          <MapView route={sock.route} vehicles={state.vehicles} meId={meId} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setTab('vehicles'); }} command={cmd} bottomInset={bottomInset} />

          <div className="pointer-events-none absolute inset-x-3.5 top-3.5 z-[1100] max-w-md space-y-2 sm:inset-x-4 sm:top-4">
            <AlertStack state={state} meId={meId} isLeader={isLeader} now={now} onShow={selectVehicle}
              onCancelSos={(id) => sock.emit('sos:cancel', { vehicleId: id })} onMore={() => { setTab('trip'); if (!isWide) setSheet('half'); }} />
            <div className="flex flex-wrap gap-1.5">
              {sock.conn !== 'online' && <StatusChip Icon={WifiOff} tone="warn">Offline · reconnecting</StatusChip>}
              {share.status === 'sharing' && share.gpsIssue && <StatusChip Icon={Crosshair} tone="warn">{share.gpsIssue}</StatusChip>}
              {share.status === 'starting' && <StatusChip Icon={Crosshair}>Getting GPS…</StatusChip>}
              {share.status === 'denied' && <StatusChip Icon={MapPinOff} tone="warn" onClick={() => setNotice('Location is blocked for this site. Allow it in your browser settings, then tap Share location.')}>Location blocked</StatusChip>}
              {share.status === 'insecure' && <StatusChip Icon={MapPinOff} tone="warn" onClick={() => setNotice('Sharing needs a secure connection. Open this site with its https:// address.')}>Needs HTTPS</StatusChip>}
              {share.status === 'unsupported' && <StatusChip Icon={MapPinOff} tone="warn">GPS not supported</StatusChip>}
              {hasSim && <StatusChip Icon={FlaskConical} tone="warn">Testing mode · SIM vehicles are fake</StatusChip>}
              {isLeader && state.journey.routeStatus !== 'ok' && <StatusChip Icon={RouteIcon} tone="warn" onClick={() => { setTab('leader'); if (!isWide) setSheet('full'); }}>No route · fix</StatusChip>}
            </div>
          </div>

          {notice && <p role="status" className="pointer-events-none absolute left-3.5 z-[1100] max-w-[calc(100%-6rem)] rounded-2xl bg-ink/95 px-4 py-3 text-[13px] font-semibold text-white shadow-float backdrop-blur sm:left-4 sm:max-w-sm" style={{ bottom: bottomInset + 72 }}>{notice}</p>}

          {!sheetFull && (
            <>
              {!blocked && (
                <button onClick={onShareClick} disabled={share.status === 'starting'} aria-pressed={sharing}
                  className={`absolute left-3.5 z-[1100] inline-flex min-h-[48px] items-center gap-2.5 rounded-full px-5 text-sm font-bold shadow-float transition-all active:scale-95 sm:left-4 ${sharing ? 'border border-teal/40 bg-white text-teal-dark' : 'bg-teal text-white hover:bg-teal-dark'}`}
                  style={{ bottom: bottomInset + 14 }}>
                  {sharing ? <><span className="dot-live h-2.5 w-2.5 rounded-full bg-teal text-teal" aria-hidden="true" />{share.status === 'starting' ? 'Starting…' : 'Sharing'}{share.status === 'sharing' && share.lastFix?.accuracy ? <span className="text-xs font-medium text-ink-soft">±{Math.round(share.lastFix.accuracy)} m</span> : null}<span className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold"><Square className="h-3 w-3" aria-hidden="true" />Stop</span></>
                    : <><Radio className="h-4 w-4" aria-hidden="true" />Share location</>}
                </button>
              )}
              <div className="absolute right-3.5 z-[1100] flex flex-col items-end gap-2.5 sm:right-4" style={{ bottom: bottomInset + 14 }}>
                <div className="flex flex-col overflow-hidden rounded-2xl border border-ink/[.08] bg-white shadow-float">
                  <button aria-label="Zoom in" className="grid h-11 w-11 place-items-center transition-colors hover:bg-sand active:scale-95" onClick={() => send('zoomIn')}><Plus className="h-[18px] w-[18px]" /></button>
                  <button aria-label="Zoom out" className="grid h-11 w-11 place-items-center border-t border-ink/[.08] transition-colors hover:bg-sand active:scale-95" onClick={() => send('zoomOut')}><Minus className="h-[18px] w-[18px]" /></button>
                </div>
                <CtrlButton Icon={LocateFixed} label="Me" onClick={showMe} />
                <CtrlButton Icon={Maximize2} label="All" onClick={() => send('fit')} />
              </div>
            </>
          )}
        </div>
      </div>

      {!isWide && <BottomSheet snap={sheet} onSnap={setSheet} onHeight={setSheetH} peek={<Peek state={state} meId={meId} selectedId={selectedId} onSelect={selectVehicle} />}>{panel}</BottomSheet>}

      <ConfirmDialog open={dlg === 'consent'} title="Share your location?" confirmLabel="Start sharing" cancelLabel="Not now" onCancel={() => setDlg(null)}
        onConfirm={() => { sessionStorage.setItem(CONSENT_KEY(journeyId), '1'); setDlg(null); share.start(); }}>
        <p>Your phone will ask for permission. While sharing is on, your position goes to the people in this journey, and only them. Stop any time.</p>
        <p><b className="text-ink">Switching apps:</b> Convoy keeps sharing in the background where your phone allows it. You may see a “Sharing your location” media control; pause it to stop sharing. For best results, add Convoy to your home screen and avoid battery saver.</p>
      </ConfirmDialog>

      <ConfirmDialog open={dlg === 'sos'} danger title="Send an SOS to your group?" confirmLabel="Send SOS" onCancel={() => setDlg(null)}
        disabled={sock.conn !== 'online'} onConfirm={() => { sock.emit('sos:start'); setDlg(null); }}>
        <p>Everyone in this journey sees an emergency alert with your latest location and when it was updated.</p>
        <p className="font-semibold text-ink">This does not call the police, an ambulance or any emergency service. If you need them, call your local emergency number.</p>
        <p>It needs an internet connection and a recent GPS position.</p>
        {sock.conn !== 'online' && <p className="font-semibold text-alert">You’re offline, so an SOS can’t be sent right now.</p>}
        {share.status !== 'sharing' && <p className="font-semibold text-alert">You aren’t sharing your location, so the group will see only your last known position, if any.</p>}
      </ConfirmDialog>

      <ConfirmDialog open={dlg === 'leave'} title="Leave this journey?" confirmLabel="Leave" busy={busy} onCancel={() => setDlg(null)}
        onConfirm={async () => { setBusy(true); try { share.stop(); await api.leave(journeyId); clearSession(journeyId); nav('/'); } catch { setBusy(false); setDlg(null); setNotice('Could not leave. Check your connection.'); } }}>
        <p>You’ll stop sharing your location and disappear from the group’s map. You can only return with the code.</p>
      </ConfirmDialog>
    </div>
  );
}
