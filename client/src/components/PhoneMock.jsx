// Product preview for the hero: a miniature of the real dashboard (map, route, ranked vehicles, bottom sheet).
const ROUTE = 'M-10 420 C 70 420, 80 330, 140 320 S 215 250, 240 190 S 300 90, 330 60';
const cars = [
  { x: 226, y: 206, c: '#1F7A72', n: 1 },
  { x: 150, y: 314, c: '#D1495B', n: 2 },
  { x: 104, y: 352, c: '#E3A72F', n: 3 },
  { x: 52, y: 405, c: '#3D5A80', n: 4 },
];

export default function PhoneMock({ className = '' }) {
  return (
    <div className={`relative mx-auto w-[262px] sm:w-[286px] ${className}`}>
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-teal/10 blur-2xl" aria-hidden="true" />
      <div className="rounded-[2.4rem] bg-ink p-[9px] shadow-float">
        <div className="relative aspect-[9/18.5] overflow-hidden rounded-[1.85rem] bg-[#E6ECE7]">
          <svg viewBox="0 0 270 560" className="absolute inset-0 h-full w-full" role="img" aria-label="Preview of the Convoy live map with four vehicles on one route" preserveAspectRatio="xMidYMid slice">
            <rect width="270" height="560" fill="#E6ECE7" />
            <path d="M0 80 C 60 60, 120 120, 190 90 S 260 50, 270 70 V0 H0Z" fill="#CFE3EE" />
            <rect x="10" y="150" width="90" height="70" rx="18" fill="#D5E7CF" />
            <rect x="170" y="330" width="100" height="90" rx="22" fill="#D5E7CF" />
            <g stroke="#fff" strokeWidth="9" strokeLinecap="round" opacity=".95">
              <path d="M-10 250 L 280 210" /><path d="M110 -10 L 150 570" /><path d="M-10 480 L 280 400" /><path d="M215 -10 L 240 570" />
            </g>
            <g stroke="#fff" strokeWidth="4" opacity=".9"><path d="M-10 170 L 280 330" /><path d="M40 -10 L 20 570" /></g>
            <path d={ROUTE} fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
            <path d={ROUTE} fill="none" stroke="#1F7A72" strokeWidth="4" strokeLinecap="round" />
            <g transform="translate(330 60)"><circle r="0" /></g>
            <g transform="translate(252 168)"><circle r="13" fill="#0F1B2D" stroke="#fff" strokeWidth="3" /><path d="M-4 -5 V5 M-4 -5 H5 L2 -2 L5 1 H-4" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>
            {cars.map((v) => (
              <g key={v.n} transform={`translate(${v.x} ${v.y})`}>
                <circle r="15" fill={v.c} stroke="#fff" strokeWidth="3" />
                <circle cx="11" cy="-11" r="7.5" fill="#0F1B2D" stroke="#fff" strokeWidth="1.5" />
                <text x="11" y="-7.6" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#fff" fontFamily="Manrope, sans-serif">{v.n}</text>
              </g>
            ))}
          </svg>

          <div className="absolute inset-x-2.5 top-3 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 shadow-card">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-100 text-amber-700" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
            </span>
            <p className="text-[11px] font-semibold leading-tight">Car D is 7.3 km behind the leader</p>
          </div>

          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-paper px-3 pb-3 pt-2 shadow-[0_-8px_24px_-8px_rgba(15,27,45,.25)]">
            <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-ink/20" />
            <p className="text-[12px] font-bold">You are 2nd of 4</p>
            <div className="mt-2 flex gap-1.5 overflow-hidden">
              {[['Car A', 'Leading', '#1F7A72'], ['Car B', '2.4 km', '#D1495B'], ['Car C', '5.1 km', '#E3A72F']].map(([n, g, c]) => (
                <div key={n} className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-ink/10 bg-white p-1.5">
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: c }} />
                  <span className="min-w-0 leading-tight"><b className="block truncate text-[10px]">{n}</b><span className="whitespace-nowrap text-[9px] text-ink-soft">{g}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
