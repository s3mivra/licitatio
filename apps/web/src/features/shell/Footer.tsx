import { Link } from 'react-router-dom';

export function Footer({ className = '' }: { className?: string }) {
  return (
    <footer className={`text-xs text-slate-500 ${className}`}>
      <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
        <p>Licitatio is a product of <span className="font-semibold text-slate-700">Semivra</span>.</p>
        <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"><Link className="hover:text-slate-800" to="/privacy">Privacy</Link><Link className="hover:text-slate-800" to="/terms">Terms</Link><span>&copy; {new Date().getFullYear()} Semivra. All rights reserved.</span></p>
      </div>
    </footer>
  );
}
