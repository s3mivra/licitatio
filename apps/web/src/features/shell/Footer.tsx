export function Footer({ className = '' }: { className?: string }) {
  return (
    <footer className={`text-xs text-slate-500 ${className}`}>
      <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
        <p>Licitatio is a product of <span className="font-semibold text-slate-700">Semivra</span>.</p>
        <p>&copy; {new Date().getFullYear()} Semivra. All rights reserved.</p>
      </div>
    </footer>
  );
}
