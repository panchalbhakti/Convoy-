import { Car, CarFront, Bike, Truck, Bus } from 'lucide-react';

export const VEHICLE_OPTIONS = [
  { value: 'car', label: 'Car', Icon: Car },
  { value: 'suv', label: 'SUV', Icon: CarFront },
  { value: 'bike', label: 'Bike', Icon: Bike },
  { value: 'van', label: 'Van', Icon: Truck },
  { value: 'bus', label: 'Bus', Icon: Bus },
];

export function VehicleIcon({ type, className = 'h-4 w-4' }) {
  const Icon = (VEHICLE_OPTIONS.find((v) => v.value === type) || VEHICLE_OPTIONS[0]).Icon;
  return <Icon className={className} aria-hidden="true" />;
}

export function VehiclePicker({ value, onChange }) {
  return (
    <fieldset>
      <legend className="label">Vehicle type</legend>
      <div className="grid grid-cols-5 gap-1.5">
        {VEHICLE_OPTIONS.map(({ value: v, label, Icon }) => {
          const active = value === v;
          return (
            <label key={v} className={`flex min-h-[56px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-teal ${active ? 'border-teal bg-teal-light text-teal-dark' : 'border-ink/15 bg-white hover:border-ink/35'}`}>
              <input type="radio" name="vehicleType" value={v} checked={active} onChange={() => onChange(v)} className="sr-only" />
              <Icon className="h-5 w-5" aria-hidden="true" />{label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
