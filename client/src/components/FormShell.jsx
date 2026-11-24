import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Logo from './Logo.jsx';

export default function FormShell({ title, intro, children }) {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2">
        <Logo />
        <Link to="/" className="btn-quiet"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Home</Link>
      </header>
      <main className="mx-auto max-w-lg px-4 pb-16 pt-3">
        <h1 className="text-[26px] font-bold leading-tight">{title}</h1>
        {intro && <p className="mt-1.5 text-sm text-ink-soft">{intro}</p>}
        <div className="card mt-5 p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-alert/30 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-alert">{message}</p>;
}
