import { Link } from 'react-router-dom';

export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="#1F7A72" />
      <path d="M9 29 C 15 29, 15 17, 22 17 S 30 11, 32 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="10" cy="29" r="3" fill="#fff" />
      <circle cx="21.5" cy="17.5" r="3" fill="#fff" />
      <circle cx="32" cy="10" r="3" fill="#F6F4EE" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

export default function Logo() {
  return (
    <Link to="/" className="flex min-h-[44px] items-center gap-2 font-bold tracking-tight">
      <LogoMark size={30} />
      <span className="text-lg">Convoy</span>
    </Link>
  );
}
