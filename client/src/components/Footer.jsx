import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';

export default function Footer() {
  return (
    <footer className="border-t border-ink/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-9 md:flex-row md:items-center md:justify-between">
        <div>
          <Logo />
          <p className="mt-1 max-w-sm text-sm text-ink-soft">Group road trips with every vehicle in sight. Runs in your phone’s browser.</p>
        </div>
        <ul className="flex flex-wrap gap-x-5 text-sm font-semibold">
          <li><Link className="flex min-h-[44px] items-center" to="/create">Start a Journey</Link></li>
          <li><Link className="flex min-h-[44px] items-center" to="/join">Join a Journey</Link></li>
          <li><a className="flex min-h-[44px] items-center" href="#how">How it works</a></li>
          <li><a className="flex min-h-[44px] items-center" href="#safety">Safety &amp; privacy</a></li>
        </ul>
      </div>
      <p className="border-t border-ink/10 px-4 py-4 text-center text-xs text-ink-soft">
        Convoy is a coordination aid, not an emergency service. Follow traffic laws and never use your phone while driving.
      </p>
    </footer>
  );
}
