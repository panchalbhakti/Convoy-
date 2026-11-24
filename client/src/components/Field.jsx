import { useId } from 'react';

export default function Field({ label, hint, ...props }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} className="input" aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}
