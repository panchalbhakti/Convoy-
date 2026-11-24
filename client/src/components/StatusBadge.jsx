import { Navigation, PauseCircle, MapPinOff, WifiOff } from 'lucide-react';

export const STATUS = {
  moving: { label: 'Moving', short: 'Moving', Icon: Navigation, text: 'text-teal-dark', bg: 'bg-teal-light' },
  stopped: { label: 'Stopped', short: 'Stopped', Icon: PauseCircle, text: 'text-amber-800', bg: 'bg-amber-100' },
  unavailable: { label: 'Location unavailable', short: 'No location', Icon: MapPinOff, text: 'text-ink-soft', bg: 'bg-sand' },
  disconnected: { label: 'Disconnected', short: 'Disconnected', Icon: WifiOff, text: 'text-ink-soft', bg: 'bg-sand' },
};

// Always icon + text, never colour alone
export default function StatusBadge({ status }) {
  const { label, Icon, text, bg } = STATUS[status] || STATUS.unavailable;
  return <span className={`chip ${bg} ${text}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</span>;
}
