import { locale, setLocale, t } from '../../lib/i18n';

export function LanguageSwitch({ className = '' }: { className?: string }) {
  return (
    <select aria-label={t('Language')} className={`rounded-md border-slate-300 py-1 text-sm ${className}`} value={locale} onChange={(e) => setLocale(e.target.value === 'fil' ? 'fil' : 'en')}>
      <option value="en">English</option>
      <option value="fil">Filipino</option>
    </select>
  );
}
