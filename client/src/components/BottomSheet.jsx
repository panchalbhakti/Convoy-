import { useEffect, useState } from 'react';

const PEEK = 134;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Mobile sheet: tap or drag the handle. The parent learns the live height so floating map controls can sit above it. */
export default function BottomSheet({ snap, onSnap, onHeight, peek, children }) {
  const [vh, setVh] = useState(window.innerHeight);
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const heights = { peek: PEEK, half: Math.round(vh * 0.55), full: vh - 60 };
  const h = drag ? drag.h : heights[snap];
  useEffect(() => { onHeight?.(h); }, [h, onHeight]);

  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag({ y: e.clientY, h0: heights[snap], h: heights[snap], moved: false }); };
  const move = (e) => {
    if (!drag) return;
    const dy = drag.y - e.clientY;
    setDrag({ ...drag, h: clamp(drag.h0 + dy, PEEK, heights.full), moved: drag.moved || Math.abs(dy) > 6 });
  };
  const up = () => {
    if (!drag) return;
    if (!drag.moved) onSnap(snap === 'peek' ? 'half' : 'peek');
    else onSnap(Object.entries(heights).sort((a, b) => Math.abs(a[1] - drag.h) - Math.abs(b[1] - drag.h))[0][0]);
    setDrag(null);
  };
  const key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSnap(snap === 'peek' ? 'half' : 'peek'); } };

  const expanded = h > PEEK + 24;
  return (
    <section
      aria-label="Journey details"
      className="fixed inset-x-0 bottom-0 z-[1200] flex flex-col rounded-t-[1.75rem] border-t border-ink/[.08] bg-paper shadow-[0_-12px_36px_-10px_rgba(15,27,45,.25)]"
      style={{ height: h, paddingBottom: 'env(safe-area-inset-bottom)', transition: drag ? 'none' : 'height .24s cubic-bezier(.2,.8,.2,1)' }}
    >
      <div
        role="button" tabIndex={0}
        aria-label={snap === 'peek' ? 'Show vehicle details' : 'Hide vehicle details'}
        aria-expanded={snap !== 'peek'}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)} onKeyDown={key}
        className="grid h-8 shrink-0 cursor-grab touch-none place-items-center active:cursor-grabbing"
      >
        <span className="h-1.5 w-11 rounded-full bg-ink/20 transition-colors hover:bg-ink/35" />
      </div>
      <div className="shrink-0">{peek}</div>
      {expanded && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5">{children}</div>}
    </section>
  );
}
