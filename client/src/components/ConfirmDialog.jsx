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
    <div
      className="fixed inset-0 z-[2000] grid place-items-center bg-ink/40 p-4 backdrop-blur-sm sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        className="pb-safe w-full max-w-sm rounded-3xl bg-white p-6 shadow-float transition-all sm:max-w-md"
      >
        <h2 id="dlg-title" className="text-xl font-bold tracking-tight text-ink">{title}</h2>
        <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-soft">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            className="btn-secondary !min-h-[46px] w-full px-5 sm:w-auto"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`!min-h-[46px] w-full px-6 sm:w-auto ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy || disabled}
            onClick={onConfirm}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
