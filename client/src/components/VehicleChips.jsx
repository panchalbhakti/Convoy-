import { Avatar } from './VehiclesPanel.jsx';
import { formatDistance } from '../lib/format.js';

/** Horizontal vehicle carousel shown in the collapsed sheet: one glance, tap to fly to a vehicle. */
export default function VehicleChips({ state, meId, selectedId, onSelect }) {
  const list = [...state.vehicles].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  return (
    <ul className="no-scrollbar flex snap-x gap-2 overflow-x-auto px-3 pb-2" aria-label="Vehicles">
      {list.map((v) => {
        const sub = v.rank === 1 ? 'Leading' : v.rank ? `${formatDistance(v.gapToLeaderM)} behind` : v.status === 'disconnected' ? 'Disconnected' : v.live ? 'Off order' : 'No location';
        return (
          <li key={v.id} className="snap-start">
            <button onClick={() => onSelect(v.id)} aria-pressed={v.id === selectedId}
              className={`flex min-h-[48px] w-[148px] items-center gap-2 rounded-xl border bg-white px-2.5 py-1.5 text-left ${v.id === selectedId ? 'border-teal ring-1 ring-teal' : v.flags.sos ? 'border-alert' : 'border-ink/[.08]'}`}>
              <Avatar v={v} size={30} />
              <span className="min-w-0 leading-tight">
                <b className="block truncate text-[13px] font-semibold">{v.id === meId ? 'You' : v.vehicleName}</b>
                <span className={`block truncate text-xs ${v.rank === 1 ? 'font-semibold text-teal-dark' : 'text-ink-soft'}`}>{sub}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
