import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import Logo from './Logo.jsx';

const links = [['Home', '#top'], ['How it works', '#how'], ['Features', '#features'], ['About', '#about']];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 px-3 pt-3">
      <nav className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl border border-ink/[.07] bg-white/85 py-1.5 pl-3 pr-1.5 shadow-card backdrop-blur-md" aria-label="Main">
        <Logo />
        <ul className="hidden items-center gap-0.5 md:flex">
          {links.map(([t, h]) => <li key={t}><a href={h} className="btn-quiet !min-h-[40px] text-ink-soft hover:text-ink">{t}</a></li>)}
        </ul>
        <div className="flex items-center gap-1.5">
          <Link to="/join" className="btn-quiet hidden sm:inline-flex">Join a Journey</Link>
          <Link to="/create" className="btn-primary">Get Started</Link>
          <button className="btn-quiet !px-2.5 md:hidden" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>
      {open && (
        <ul className="mx-auto mt-2 max-w-6xl rounded-2xl border border-ink/[.07] bg-white p-2 shadow-card md:hidden">
          {links.map(([t, h]) => <li key={t}><a href={h} onClick={() => setOpen(false)} className="flex min-h-[44px] items-center rounded-lg px-3 font-semibold hover:bg-sand">{t}</a></li>)}
          <li><Link to="/join" className="flex min-h-[44px] items-center rounded-lg px-3 font-semibold hover:bg-sand">Join a Journey</Link></li>
        </ul>
      )}
    </header>
  );
}
