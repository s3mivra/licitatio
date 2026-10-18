import { PLAN_PRICES, TRIAL_DAYS, formatCentavos } from '@licitatio/shared';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { cx } from '../../ui';
import { LanguageSwitch } from '../shell/LanguageSwitch';
import { CountUp, LiveDot, LiveFeed, Marquee, Reveal, TypedWord } from './motion';

// ---------- layout ----------

const LINKS = [
  { to: '/#features', label: 'Features' },
  { to: '/#pricing', label: 'Pricing' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/about', label: 'About' },
  { to: '/install', label: 'Install' },
];

const PILL_DARK = 'group/pill inline-flex items-center justify-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-slate-700 active:scale-[0.98] [&>span]:transition-transform hover:[&>span]:translate-x-0.5';
const PILL_LIGHT = 'inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-slate-400 hover:bg-slate-50';

/** small monospace label: "01 / Features" */
function Kicker({ n, children }: { n?: string; children: ReactNode }) {
  return <p className="font-mono text-xs tracking-wide text-slate-500">{n && <>{n} / </>}{children}</p>;
}

function Logo({ small }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <img src="/icon.svg" alt="" width={small ? 24 : 28} height={small ? 24 : 28} className={small ? 'h-6 w-6' : 'h-7 w-7'} />
      <span className="font-display text-[15px] font-bold uppercase tracking-[0.14em] text-ink">Licitatio</span>
    </span>
  );
}

function PublicHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="Licitatio home"><Logo /></Link>
        <nav className="mx-auto hidden items-center gap-1 md:flex" aria-label="Site">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className="group relative rounded-md px-3 py-2 text-sm text-slate-600 transition-colors hover:text-ink">{l.label}<span className="absolute inset-x-3 bottom-1 h-px origin-left scale-x-0 bg-ink transition-transform duration-300 group-hover:scale-x-100" aria-hidden /></NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <span className="hidden items-center gap-2 text-xs text-slate-500 lg:flex"><LiveDot />{TRIAL_DAYS}-day free trial</span>
          <Link to="/login" className="text-sm font-medium text-slate-700 hover:text-ink">Sign in</Link>
          <Link to="/register" className={cx(PILL_DARK, 'px-4 py-2')}>Start free</Link>
        </div>
        <button type="button" className="ml-auto rounded-md p-2 text-slate-700 md:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} /></svg>
        </button>
      </div>
      {open && (
        <nav className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 md:hidden" aria-label="Site">
          {LINKS.map((l) => <Link key={l.to} to={l.to} className="block border-b border-slate-100 py-3 text-base text-slate-800" onClick={() => setOpen(false)}>{l.label}</Link>)}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to="/login" className={PILL_LIGHT}>Sign in</Link>
            <Link to="/register" className={PILL_DARK}>Start free</Link>
          </div>
          <div className="mt-4"><LanguageSwitch /></div>
        </nav>
      )}
    </header>
  );
}

function PublicFooter() {
  const col = (title: string, links: Array<[string, string]>) => (
    <div>
      <p className="font-mono text-xs text-slate-500">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
        {links.map(([to, label]) => <li key={label}><Link className="hover:text-white" to={to}>{label}</Link></li>)}
      </ul>
    </div>
  );
  return (
    <footer className="bg-ink text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <span className="flex items-center gap-2">
            <img src="/icon.svg" alt="" width={28} height={28} className="h-7 w-7" />
            <span className="font-display text-[15px] font-bold uppercase tracking-[0.14em]">Licitatio</span>
          </span>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-accent-400">Bid ready, every time</p>
          <p className="mt-5 max-w-xs text-sm text-slate-400">Bid readiness for Philippine contractors. A product of <span className="font-semibold text-white">Semivra</span>, Angeles City, Pampanga.</p>
        </div>
        {col('Product', [['/#features', 'Features'], ['/#pricing', 'Pricing'], ['/gallery', 'Gallery'], ['/install', 'Install the app']])}
        {col('Company', [['/about', 'About'], ['/register', 'Start a trial'], ['/login', 'Sign in']])}
        {col('Legal', [['/privacy', 'Privacy policy'], ['/terms', 'Terms of service']])}
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-2 border-t border-white/10 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:justify-between sm:px-6">
        <p>&copy; {new Date().getFullYear()} Semivra. All rights reserved.</p>
        <p>Licitatio is a product of Semivra.</p>
      </div>
    </footer>
  );
}

function PublicLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    const el = id ? document.getElementById(id) : null;
    if (el) el.scrollIntoView(); else window.scrollTo(0, 0);
  }, []);
  return (
    <div className="flex min-h-screen flex-col bg-white text-ink">
      <PublicHeader />
      <main id="main" className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <section className="border-b border-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <Kicker>{eyebrow}</Kicker>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">{title}</h1>
        {children && <div className="mt-5 max-w-2xl text-base text-slate-600 sm:text-lg">{children}</div>}
      </div>
    </section>
  );
}

// ---------- gallery data (screenshots of the demo workspace) ----------

const SHOTS = [
  { src: '/gallery/dashboard.png', title: 'Dashboard', body: 'Expiring documents, next deadlines and open tasks at a glance.' },
  { src: '/gallery/bids.png', title: 'Bid tracker', body: 'Every bid on one board, from identified to awarded, with countdowns.' },
  { src: '/gallery/packet.png', title: 'Bid packet', body: 'Requirements matched to your documents, with a readiness check before you export.' },
  { src: '/gallery/vault.png', title: 'Document vault', body: 'Permits, licenses and certificates with versions and expiry alerts.' },
  { src: '/gallery/proposal.png', title: 'Proposal builder', body: 'Sections, reusable text and your company details filled in for you.' },
  { src: '/gallery/outcomes.png', title: 'Outcomes', body: 'Win rate, winning bids and how close your pricing was.' },
];

function Shot({ src, title, priority }: { src: string; title: string; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-[0_20px_50px_-20px_rgba(11,16,32,0.25)]">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2.5" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" /><span className="h-2.5 w-2.5 rounded-full bg-slate-200" /><span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
      </div>
      <img src={src} alt={`Screenshot: ${title}`} width={1280} height={800} loading={priority ? 'eager' : 'lazy'} decoding="async" className="block aspect-[16/10] w-full object-cover object-top" />
    </div>
  );
}

// ---------- landing ----------

const BAND = [
  { label: 'Document vault', note: 'Expiry alerts', cls: 'bg-emerald-400 text-ink' },
  { label: 'Bid packets', note: 'One indexed PDF', cls: 'bg-accent-400 text-ink' },
  { label: 'Proposals', note: 'Word or PDF', cls: 'bg-brand-600 text-white' },
  { label: 'Outcomes', note: 'Win rate', cls: 'bg-orange-500 text-white' },
];

const STATS = [
  { label: 'Day free trial', value: TRIAL_DAYS, suffix: '' },
  { label: 'Requirement templates', value: 5, suffix: '' },
  { label: 'Days of warning by default', value: 60, suffix: '' },
  { label: 'Click to export a packet', value: 1, suffix: '' },
];

const FEATURES = [
  { tag: 'Vault', dot: 'bg-emerald-500', title: 'No more paper disqualifications', body: 'Every permit and certificate is tracked, with email and SMS warnings weeks before anything expires.' },
  { tag: 'Packets', dot: 'bg-accent-500', title: 'Bid packets in hours', body: 'Pick a template. Licitatio matches your documents, fills the schedules and exports one indexed PDF.' },
  { tag: 'Proposals', dot: 'bg-brand-600', title: 'Proposals without starting over', body: 'Reuse saved text, fill in company details automatically and draft sections with AI.' },
  { tag: 'Tracker', dot: 'bg-orange-500', title: 'Every deadline in your calendar', body: 'Paste the invitation to bid and the deadlines fill themselves in, then show up in Google Calendar, Outlook or your phone.' },
  { tag: 'Analytics', dot: 'bg-violet-500', title: 'Learn from every result', body: 'Record the winning bid and see your win rate and how close your pricing was.' },
  { tag: 'NFCC', dot: 'bg-emerald-600', title: 'Know if you can bid before you start', body: 'Licitatio computes your NFCC against the approved budget, shows the bid security to prepare and prints the NFCC form for the packet.' },
  { tag: 'Scan', dot: 'bg-pink-500', title: 'Snap a permit, skip the typing', body: 'Take a photo or upload a PDF. AI reads the type, number and dates and fills the form for you to check.' },
  { tag: 'Submission', dot: 'bg-amber-600', title: 'Pack the envelopes without panic', body: 'Tick items off on your phone, note originals, certified copies and notarized papers, and print envelope labels.' },
  { tag: 'Pricing', dot: 'bg-sky-500', title: 'Price the bid in the same place', body: 'Build each unit price from materials, labor and equipment, add OCM, profit and VAT, and see at once if you are over the approved budget.' },
];

const STEPS = [
  { title: 'Upload your documents once', body: 'Permits, licenses, financial statements and your company profile.', time: 'About 1 hour', bar: 'bg-emerald-400' },
  { title: 'Add a bid', body: 'Enter the reference number and deadline, then pick a requirement template.', time: '5 minutes', bar: 'bg-accent-400' },
  { title: 'Fix what is flagged', body: 'Missing or expiring items show up before the deadline, not after.', time: 'As needed', bar: 'bg-brand-600' },
  { title: 'Export and submit', body: 'One indexed PDF packet and your proposal, ready to print or upload.', time: 'One click', bar: 'bg-orange-500' },
];

const PRICING: Array<{ code: 'starter' | 'pro' | 'desk'; name: string; for: string; points: string[]; featured?: boolean }> = [
  { code: 'starter', name: 'Starter', for: 'Small teams starting out', points: ['3 users', '1 GB storage', '10 active bids', '20 packet exports a month'] },
  { code: 'pro', name: 'Pro', for: 'Contractors who bid every month', points: ['10 users', '5 GB storage', 'Unlimited bids', 'Proposal and price builder', 'AI drafting', '100 exports a month'], featured: true },
  { code: 'desk', name: 'Desk', for: 'Our team prepares packets with you', points: ['15 users', '10 GB storage', 'Unlimited exports', 'Semivra staff prepare bids with you'] },
];

const FAQ = [
  { q: 'Does Licitatio submit bids for us?', a: 'No. Licitatio prepares and checks your packet and proposal. Your team reviews every export and submits it.' },
  { q: 'Can we pay with GCash?', a: 'Yes. Plans can be paid online with GCash, Maya, GrabPay or card, or by bank transfer.' },
  { q: 'Does it work on a phone?', a: 'Yes. It works in any modern browser and can be installed on Android, iPhone and computers.' },
  { q: 'Who owns our documents?', a: 'You do. You can export everything at any time, and each company\'s data is kept separate from every other company.' },
  { q: 'What happens when the trial ends?', a: `After ${TRIAL_DAYS} days, choose a plan to keep editing. Nothing is deleted, and you can still view and download your documents.` },
];

const FEED = [
  { title: 'Mayor\'s permit expires in 18 days', sub: 'SMS and email reminder sent', dot: 'bg-accent-400 text-ink', icon: '!' },
  { title: 'Packet ready: Road concreting', sub: '6 of 6 requirements met', dot: 'bg-emerald-400 text-ink', icon: '✓' },
  { title: 'Bid due Friday, 10:00 AM', sub: 'DPWH Rizal 1st DEO', dot: 'bg-brand-600 text-white', icon: '•' },
  { title: 'PCAB license renewed', sub: 'New version saved to the vault', dot: 'bg-sky-400 text-ink', icon: '↻' },
  { title: 'NFCC check passed: Road widening', sub: 'PHP 85M capacity vs PHP 50M budget', dot: 'bg-emerald-400 text-ink', icon: '₱' },
  { title: 'Scanned: Mayor\'s permit 2026', sub: 'Number and expiry filled in', dot: 'bg-pink-400 text-ink', icon: '⌁' },
  { title: 'Envelope 1 packed', sub: '14 of 14 items ticked', dot: 'bg-amber-400 text-ink', icon: '✉' },
  { title: 'Bid price within budget', sub: 'PHP 4.62M, 95.3% of the ABC', dot: 'bg-sky-400 text-ink', icon: '=' },
  { title: 'Proposal exported', sub: 'Technical proposal.docx', dot: 'bg-violet-400 text-ink', icon: '↓' },
  { title: 'Bid awarded: School building', sub: 'Outcome recorded', dot: 'bg-orange-500 text-white', icon: '★' },
];

const MISSING = ['permit', 'certificate', 'license', 'signature', 'deadline'] as const;

export function Landing() {
  return (
    <PublicLayout>
      {/* hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_1fr]">
        <div className="motion-safe:animate-enter">
          <p className="font-mono text-xs text-slate-500">Built for Philippine contractors · Public and private bids</p>
          <h1 className="mt-5 text-[2.75rem] font-bold leading-[1.02] tracking-tight text-ink sm:text-6xl">
            Never lose a bid to a missing <TypedWord words={MISSING} className="rounded-md bg-accent-400 px-2" /> again.
          </h1>
          <p className="mt-6 max-w-xl text-base text-slate-600 sm:text-lg">Documents, track record and bids in one place. Licitatio warns you before anything expires and builds your bid packet and proposal in hours, not days.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/register" className={PILL_DARK}>Start your {TRIAL_DAYS}-day free trial <span aria-hidden>→</span></Link>
            <Link to="/gallery" className={PILL_LIGHT}>See the app</Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">No credit card needed. Works on phone, tablet and computer.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-[0_20px_50px_-24px_rgba(11,16,32,0.25)] motion-safe:animate-enter [animation-delay:150ms]">
          <div className="flex items-center justify-between px-1 pb-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-2"><LiveDot />Your bid desk, running on Licitatio</span>
            <span className="font-mono">Example</span>
          </div>
          <div className="h-[13.5rem] overflow-hidden sm:h-[13.75rem]"><LiveFeed items={FEED} /></div>
        </div>
      </section>

      {/* color band, scrolling */}
      <Marquee seconds={36}>
        {BAND.map((b) => (
          <div key={b.label} className={cx('flex w-64 shrink-0 items-center justify-between gap-3 px-5 py-3 text-xs font-semibold sm:w-80', b.cls)}>
            <span>{b.label}</span><span className="font-mono font-normal opacity-80">{b.note}</span>
          </div>
        ))}
      </Marquee>

      {/* numbers */}
      <section className="border-b border-slate-200">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:px-6 md:grid-cols-4">
          {STATS.map((x, i) => (
            <div key={x.label} className={cx('py-8', i > 0 && 'md:border-l md:border-slate-200 md:pl-8', i % 2 === 1 && 'border-l border-slate-200 pl-6 md:pl-8')}>
              <dt className="font-mono text-[11px] text-slate-500">{x.label}</dt>
              <dd className="mt-2 font-display text-4xl font-bold tracking-tight"><CountUp to={x.value} suffix={x.suffix} /></dd>
            </div>
          ))}
        </dl>
      </section>

      {/* features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24">
        <Kicker n="01">Features</Kicker>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">One desk for everything a bid needs.</h2>
        <p className="mt-3 max-w-xl text-sm text-slate-600 sm:text-base">Start with your documents, then let every bid reuse them.</p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90} className="h-full">
            <div className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_16px_40px_-24px_rgba(11,16,32,0.3)]">
              <p className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500"><span className={cx('h-1.5 w-1.5 rounded-full', f.dot)} aria-hidden />{f.tag}</p>
              <h3 className="mt-4 text-lg font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{f.body}</p>
              <Link to="/gallery" className="mt-5 flex items-center justify-between text-sm font-medium text-ink">See it <span className="transition-transform group-hover:translate-x-1" aria-hidden>→</span></Link>
            </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* process */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 sm:pb-24">
        <Kicker n="02">How it works</Kicker>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Bid ready in four steps.</h2>
        <p className="mt-3 text-sm text-slate-600 sm:text-base">Set up once. Every bid after that starts mostly done.</p>
        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Reveal delay={i * 120}>
              <div className="h-0.5 w-full bg-slate-200"><div className={cx('h-0.5 w-3/5', s.bar)} /></div>
              <p className="mt-4 font-mono text-xs text-slate-400">0{i + 1}</p>
              <h3 className="mt-1 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{s.body}</p>
              <p className="mt-3 font-mono text-[11px] text-slate-400">{s.time}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* pricing */}
      <section id="pricing" className="scroll-mt-16 bg-ink py-20 text-white sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="font-mono text-xs text-slate-400">03 / Pricing</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Simple, upfront pricing.</h2>
          <p className="mt-3 text-sm text-slate-400 sm:text-base">Every plan starts with a {TRIAL_DAYS}-day free trial. Pay yearly and get 2 months free.</p>
          <div className="mt-10 grid gap-3 lg:grid-cols-3">
            {PRICING.map((p, i) => (
              <Reveal key={p.code} delay={i * 100} className="h-full">
              <div className={cx('flex h-full flex-col rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1', p.featured ? 'bg-accent-400 text-ink' : 'border border-white/15 bg-white/[0.03]')}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.featured && <span className="flex items-center gap-1.5 font-mono text-[11px]"><span className="h-1.5 w-1.5 rounded-full bg-ink" aria-hidden />Most popular</span>}
                </div>
                <p className={cx('mt-4 font-mono text-[11px]', p.featured ? 'text-ink/60' : 'text-slate-500')}>Per month</p>
                <p className="mt-1 font-display text-4xl font-bold tracking-tight">PHP {formatCentavos(PLAN_PRICES[p.code]).replace(/\.00$/, '')}</p>
                <p className={cx('mt-1 text-sm', p.featured ? 'text-ink/70' : 'text-slate-400')}>{p.for}</p>
                <ul className={cx('mt-6 flex-1 space-y-2.5 border-t pt-6 text-sm', p.featured ? 'border-ink/15' : 'border-white/10 text-slate-300')}>
                  {p.points.map((x) => <li key={x} className="flex gap-2"><span aria-hidden className={p.featured ? 'text-ink' : 'text-accent-400'}>+</span>{x}</li>)}
                </ul>
                <Link to="/register" className={cx('mt-8 rounded-full px-4 py-2.5 text-center text-sm font-semibold transition-colors', p.featured ? 'bg-ink text-white hover:bg-slate-800' : 'border border-white/25 text-white hover:bg-white/10')}>Start free trial <span aria-hidden>→</span></Link>
              </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-400">
            {['GCash, Maya and card', 'Cancel anytime', 'Export your data anytime', 'Filipino and English'].map((x) => <span key={x} className="rounded-full border border-white/15 px-3 py-1">{x}</span>)}
          </div>
        </div>
      </section>

      {/* faq */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <Kicker n="04">FAQ</Kicker>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Common<br className="hidden lg:block" /> questions.</h2>
        </div>
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {FAQ.map((f, i) => (
            <details key={f.q} className="group py-5" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium sm:text-base [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition-transform group-open:rotate-45 group-open:border-ink group-open:bg-ink group-open:text-white" aria-hidden>+</span>
              </summary>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* call to action */}
      <section className="bg-accent-400 px-4 py-20 text-center sm:py-24">
        <Reveal>
        <h2 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">Make your next bid complete.</h2>
        <p className="mt-4 text-sm text-ink/75 sm:text-base">Set up in minutes. Bring your permits; we handle the reminders.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/register" className={PILL_DARK}>Start free trial <span aria-hidden>→</span></Link>
          <Link to="/install" className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink hover:bg-white/80">Install on your phone</Link>
        </div>
        </Reveal>
      </section>
    </PublicLayout>
  );
}

// ---------- about ----------

export function AboutPage() {
  return (
    <PublicLayout>
      <PageIntro eyebrow="About" title="Built for the people who prepare the bids">
        <p>Licitatio is made by Semivra for Philippine construction firms that compete for public and private projects.</p>
      </PageIntro>
      <div className="mx-auto max-w-3xl space-y-14 px-4 py-16 sm:px-6 text-slate-700">
        <section>
          <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Why we built it</h2>
          <p className="mt-4 leading-relaxed">In public bidding, a strong technical offer and a good price can still lose to one expired permit or a missing certificate. Most firms track their documents in folders and spreadsheets, and the same schedules are retyped for every bid. We built Licitatio so that the paperwork is ready before the invitation to bid arrives.</p>
        </section>
        <section>
          <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">What we believe</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              ['You stay in control', 'Licitatio prepares and checks. Your team reviews every export and submits it. We never submit bids for you.'],
              ['Your data is yours', 'Export everything at any time. Each company\'s data is kept separate from every other company.'],
              ['Simple beats clever', 'Clear screens that work on a phone at the site office, not only on a desktop.'],
              ['Local first', 'Philippine requirements, peso pricing, GCash, SMS and Filipino.'],
            ].map(([t, b]) => (
              <li key={t} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="font-semibold text-slate-900">{t}</p><p className="mt-1.5 text-sm">{b}</p></li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">About Semivra</h2>
          <p className="mt-4 leading-relaxed">Semivra is the company behind Licitatio. Besides the software, our desk team can prepare bid packets with you on the Desk plan, working inside your workspace only with access you grant, for a limited time, with every action recorded in your audit log.</p>
        </section>
        <div className="rounded-2xl bg-accent-400 p-8 text-center">
          <p className="font-semibold text-slate-900">Want to see it with your own documents?</p>
          <Link to="/register" className="mt-4 inline-block rounded-full bg-ink text-white hover:bg-slate-700 px-6 py-3 font-bold">Start free trial</Link>
        </div>
      </div>
    </PublicLayout>
  );
}

// ---------- gallery ----------

export function GalleryPage() {
  const [zoom, setZoom] = useState<number | null>(null);
  const current = zoom === null ? undefined : SHOTS[zoom];
  useEffect(() => {
    if (zoom === null) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoom(null);
      if (e.key === 'ArrowRight') setZoom((z) => (z === null ? z : (z + 1) % SHOTS.length));
      if (e.key === 'ArrowLeft') setZoom((z) => (z === null ? z : (z - 1 + SHOTS.length) % SHOTS.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);
  return (
    <PublicLayout>
      <PageIntro eyebrow="Gallery" title="A look inside Licitatio">
        <p>Screens from a demo workspace. Tap any picture to enlarge it.</p>
      </PageIntro>
      <div className="mx-auto grid max-w-6xl gap-x-8 gap-y-12 px-4 py-16 sm:px-6 md:grid-cols-2">
        {SHOTS.map((s, i) => (
          <figure key={s.src}>
            <button type="button" className="block w-full text-left" onClick={() => setZoom(i)} aria-label={`Enlarge ${s.title}`}>
              <Shot src={s.src} title={s.title} priority={i < 2} />
            </button>
            <figcaption className="mt-4"><p className="text-lg font-semibold">{s.title}</p><p className="mt-1 text-sm text-slate-600">{s.body}</p></figcaption>
          </figure>
        ))}
      </div>
      {current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4" role="dialog" aria-modal="true" aria-label={current.title} onClick={() => setZoom(null)}>
          <div className="w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
            <img src={current.src} alt={`Screenshot: ${current.title}`} className="max-h-[80vh] w-full rounded-xl object-contain" />
            <div className="mt-3 flex items-center justify-between gap-3 text-white">
              <button type="button" className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20" onClick={() => setZoom((zoom! - 1 + SHOTS.length) % SHOTS.length)}>Previous</button>
              <p className="text-center text-sm font-medium">{current.title}</p>
              <div className="flex gap-2">
                <button type="button" className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20" onClick={() => setZoom((zoom! + 1) % SHOTS.length)}>Next</button>
                <button type="button" className="rounded-md border border-slate-200 bg-accent-400 px-4 py-2 text-sm font-bold text-ink" onClick={() => setZoom(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PublicLayout>
  );
}

// ---------- policies ----------

function DraftNotice() {
  return (
    <div className="mb-8 rounded-xl border border-accent-400 bg-accent-100 p-4 text-sm text-ink" role="note">
      This policy is being reviewed by our lawyer. The reviewed version will replace this page, and account holders will be told by email before any material change takes effect.
    </div>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 text-slate-700 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:leading-relaxed [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>;
}

export function PrivacyPage() {
  return (
    <PublicLayout>
      <PageIntro eyebrow="Legal" title="Privacy policy"><p>How Semivra handles data in Licitatio, under the Data Privacy Act of 2012 (RA 10173).</p></PageIntro>
      <Prose>
        <DraftNotice />
        <h2>Who we are</h2>
        <p>Licitatio is operated by Semivra. For privacy questions, contact our Data Protection Officer through the support channel listed in your account.</p>
        <h2>Our role</h2>
        <p>Companies that subscribe decide what to store in Licitatio. For personal data a company enters about its people, such as engineers' names, license numbers and résumés, the company is the personal information controller and Semivra is the processor acting on its instructions. For data about our own users' accounts, Semivra is the controller.</p>
        <h2>What we collect</h2>
        <ul>
          <li>Name, email and password (stored only as a secure hash), to create and protect your account.</li>
          <li>Sign-in records such as time, IP address and browser, for security and the audit log.</li>
          <li>Company profile and registrations, including the TIN, to prepare bid documents.</li>
          <li>Personnel records: names, positions, professions, licenses, experience and résumés, for personnel schedules and proposals.</li>
          <li>Uploaded documents such as permits, licenses and financial statements, for the document vault and bid packets.</li>
          <li>Activity history (who changed what, and when), for each company's audit log.</li>
          <li>A mobile number, only if you turn on SMS reminders.</li>
        </ul>
        <h2>How long we keep it</h2>
        <ul>
          <li>Account and company data: while the subscription is active, then for a limited period after it ends, unless deletion is requested earlier.</li>
          <li>Generated exports: 30 days. Unfinished uploads: 24 hours. Application logs: 14 days. Encrypted backups: 30 days.</li>
        </ul>
        <h2>Who processes it for us</h2>
        <p>We use service providers for hosting, database, file storage, email, backups and, when they are turned on, SMS (Semaphore), online payments (PayMongo) and AI drafting (Anthropic). Hosting is in Singapore. Card and wallet details are entered on PayMongo's page and never reach our servers. AI drafting sends your company profile, registers and bid details, never your TIN or contact details, and only when a user asks for a draft.</p>
        <h2>Semivra desk staff</h2>
        <p>When a company owner grants access, named Semivra staff can work in that workspace for a limited period of at most 90 days. The owner can revoke it at any time, and every staff action is recorded in the company's audit log.</p>
        <h2>Security</h2>
        <p>Encryption in transit and at rest, hashed passwords, two-factor authentication for Semivra staff, separation of each company's data, short-lived download links and nightly encrypted backups.</p>
        <h2>Your rights</h2>
        <p>You may ask to be informed, to access, to correct, to object, to erase or block, and to data portability, and you may file a complaint with the National Privacy Commission. For data a company entered about you, contact that company first; we will help them respond. Companies can request a full export or deletion of their workspace at any time.</p>
        <h2>Changes</h2>
        <p>We will notify account holders by email before material changes take effect.</p>
      </Prose>
    </PublicLayout>
  );
}

export function TermsPage() {
  return (
    <PublicLayout>
      <PageIntro eyebrow="Legal" title="Terms of service"><p>The rules for using Licitatio.</p></PageIntro>
      <Prose>
        <DraftNotice />
        <h2>The service</h2>
        <p>Licitatio is a bid readiness workspace: a document vault with expiry reminders, registers, a bid tracker, bid packets with a readiness check, a proposal builder and exports. Semivra does not submit bids. Your team reviews every export and submits it.</p>
        <h2>Not legal or procurement advice</h2>
        <p>Requirement templates are starting points. Always check them against the actual invitation to bid and the current rules, including RA 9184 and its implementing rules. The readiness check reflects the data you entered and is not a guarantee of eligibility. AI drafts can be wrong and must be reviewed before use.</p>
        <h2>Plans and payment</h2>
        <p>Starter, Pro and Desk plans are billed in Philippine pesos for 1, 3 or 12 months. New workspaces start with a {TRIAL_DAYS}-day trial. After a plan expires there is a 7-day grace period; after that the workspace becomes read-only, and you can still view and download everything.</p>
        <h2>Desk service</h2>
        <p>On the Desk plan, Semivra staff help prepare bids. Access is granted and revocable by the owner, limited in time, and recorded in the audit log. Staff cannot waive mandatory requirements or manage members, staff access, plans or the audit log.</p>
        <h2>Your responsibilities</h2>
        <ul>
          <li>Keep your data accurate and keep the original documents.</li>
          <li>Have a lawful basis for the personnel data you enter.</li>
          <li>Keep your account secure and do not upload unlawful content.</li>
        </ul>
        <h2>Your data</h2>
        <p>Your company owns its data. On request we provide a full export of your records and files. When an account ends, data is kept for a limited period and then deleted, or earlier on written request.</p>
        <h2>Governing law</h2>
        <p>These terms are governed by the laws of the Republic of the Philippines.</p>
      </Prose>
    </PublicLayout>
  );
}

// ---------- install ----------

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(() => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallPrompt); };
    const onInstalled = () => { setInstalled(true); setEvent(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  return { event, installed, install: async () => { if (!event) return; await event.prompt(); await event.userChoice; setEvent(null); } };
}

const PLATFORMS = [
  { name: 'Android (Chrome)', steps: ['Open Licitatio in Chrome.', 'Tap the menu (three dots) at the top right.', 'Tap "Install app" or "Add to Home screen".', 'Open Licitatio from your home screen.'] },
  { name: 'iPhone and iPad (Safari)', steps: ['Open Licitatio in Safari.', 'Tap the Share button at the bottom.', 'Scroll down and tap "Add to Home Screen".', 'Tap "Add", then open it from your home screen.'] },
  { name: 'Windows and Mac (Chrome or Edge)', steps: ['Open Licitatio in Chrome or Microsoft Edge.', 'Click the install icon at the right end of the address bar.', 'Click "Install".', 'Licitatio opens in its own window and appears in your apps.'] },
];

export function InstallPage() {
  const { event, installed, install } = useInstallPrompt();
  return (
    <PublicLayout>
      <PageIntro eyebrow="Install" title="Put Licitatio on your phone or computer">
        <p>Licitatio installs straight from your browser. No app store, no large download, and it updates itself.</p>
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center sm:p-8">
          {installed ? (
            <p className="font-bold text-ink">Licitatio is installed on this device.</p>
          ) : event ? (
            <>
              <p className="font-semibold text-slate-900">Your browser can install Licitatio now.</p>
              <button type="button" onClick={() => void install()} className="mt-4 rounded-lg border border-slate-200 bg-ink text-accent-300 px-6 py-3 font-bold">Install Licitatio</button>
            </>
          ) : (
            <p className="text-slate-700">Follow the steps for your device below. If you do not see an install option, open this page in Chrome, Edge or Safari.</p>
          )}
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PLATFORMS.map((p) => (
            <section key={p.name} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold text-ink">{p.name}</h2>
              <ol className="mt-4 space-y-3 text-sm text-slate-700">
                {p.steps.map((s, i) => <li key={s} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] text-white">{i + 1}</span><span>{s}</span></li>)}
              </ol>
            </section>
          ))}
        </div>
        <div className="mt-10 grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
          <p><span className="font-semibold text-slate-900">Fast to open.</span> The app is stored on your device, so it starts quickly even on slow connections.</p>
          <p><span className="font-semibold text-slate-900">Always current.</span> Updates arrive the next time you open it.</p>
          <p><span className="font-semibold text-slate-900">Same account.</span> Sign in with the same email on every device.</p>
        </div>
      </div>
    </PublicLayout>
  );
}
