import { useEffect, useRef } from 'react';

export default function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, busy, disabled, onConfirm, onCancel }) {
  const cancelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] grid place-items-end bg-ink/45 p-3 backdrop-blur-[2px] sm:place-items-center" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="pb-safe w-full max-w-sm rounded-3xl bg-white p-5 shadow-float">
        <h2 id="dlg-title" className="text-lg font-bold">{title}</h2>
        <div className="mt-2 space-y-2 text-sm text-ink-soft">{children}</div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button ref={cancelRef} className="btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy || disabled} onClick={onConfirm}>{busy ? 'Please wait…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
