import { PLAN_PRICES, TRIAL_DAYS, formatCentavos } from '@licitatio/shared';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { cx } from '../../ui';
import { LanguageSwitch } from '../shell/LanguageSwitch';

// ---------- layout ----------

const LINKS = [
  { to: '/about', label: 'About' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/install', label: 'Install' },
];

function PublicHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b-2 border-ink bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2" aria-label="Licitatio home">
          <img src="/icon.svg" alt="" width={32} height={32} className="h-8 w-8" />
          <span className="font-display text-xl font-bold tracking-tight text-ink">Licitatio</span>
        </Link>
        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Site">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => cx('rounded-md px-3 py-2 text-sm font-medium', isActive ? 'bg-accent-400 text-ink ring-2 ring-ink' : 'text-slate-700 hover:bg-paper hover:text-ink')}>{l.label}</NavLink>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <LanguageSwitch />
          <Link to="/login" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Sign in</Link>
          <Link to="/register" className="rounded-md press border-2 border-ink bg-accent-400 text-ink shadow-brut hover:shadow-brut-sm px-4 py-2 text-sm font-bold">Start free trial</Link>
        </div>
        <button type="button" className="ml-auto rounded p-2 text-slate-600 md:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 6h16M4 12h16M4 18h16'} /></svg>
        </button>
      </div>
      {open && (
        <nav className="border-t-2 border-ink bg-white px-4 py-3 md:hidden" aria-label="Site">
          {LINKS.map((l) => <Link key={l.to} to={l.to} className="block rounded-md px-3 py-2.5 text-base font-medium text-slate-700 hover:bg-slate-100" onClick={() => setOpen(false)}>{l.label}</Link>)}
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
            <Link to="/login" className="rounded-md press border-2 border-ink bg-white text-ink shadow-brut hover:shadow-brut-sm px-3 py-2.5 text-center text-sm font-bold">Sign in</Link>
            <Link to="/register" className="rounded-md press border-2 border-ink bg-accent-400 text-ink shadow-brut hover:shadow-brut-sm px-3 py-2.5 text-center text-sm font-bold">Start free trial</Link>
          </div>
          <div className="mt-3"><LanguageSwitch /></div>
        </nav>
      )}
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t-2 border-ink bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2"><img src="/icon.svg" alt="" width={28} height={28} className="h-7 w-7" /><span className="font-display text-lg font-bold text-ink">Licitatio</span></div>
          <p className="mt-3 text-sm text-slate-600">Bid readiness for Philippine contractors. A product of <span className="font-semibold text-slate-800">Semivra</span>.</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Product</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li><Link className="hover:text-slate-900" to="/about">About</Link></li>
            <li><Link className="hover:text-slate-900" to="/gallery">Gallery</Link></li>
            <li><Link className="hover:text-slate-900" to="/install">Install the app</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Legal</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li><Link className="hover:text-slate-900" to="/privacy">Privacy policy</Link></li>
            <li><Link className="hover:text-slate-900" to="/terms">Terms of service</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t-2 border-ink bg-ink py-5 text-center text-xs font-medium text-accent-300">&copy; {new Date().getFullYear()} Semivra. All rights reserved.</div>
    </footer>
  );
}

function PublicLayout({ children }: { children: ReactNode }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <PublicHeader />
      <main id="main" className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <section className="border-b-2 border-ink bg-paper">
      <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:py-20">
        <p className="inline-block rounded-md border-2 border-ink bg-accent-300 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-ink">{eyebrow}</p>
        <h1 className="mt-5 text-4xl font-bold leading-[1.1] text-ink sm:text-5xl">{title}</h1>
        {children && <div className="mx-auto mt-5 max-w-2xl text-base text-slate-700 sm:text-lg">{children}</div>}
      </div>
    </section>
  );
}

// ---------- gallery data (screenshots of the demo workspace) ----------

const SHOTS = [
  { src: '/gallery/dashboard.png', title: 'Dashboard', body: 'Expiring documents, next deadlines and open tasks at a glance.' },
  { src: '/gallery/bids.png', title: 'Bid tracker', body: 'Every bid on one board, from identified to awarded, with countdowns.' },
  { src: '/gallery/packet.png', title: 'Bid packet', body: 'Requirements matched to your documents, with a readiness verdict before you export.' },
  { src: '/gallery/vault.png', title: 'Document vault', body: 'Permits, licenses and certificates with versions and expiry alerts.' },
  { src: '/gallery/proposal.png', title: 'Proposal builder', body: 'Sections, reusable text and your company details filled in for you.' },
  { src: '/gallery/outcomes.png', title: 'Outcomes', body: 'Win rate, winning bids and how close your pricing was.' },
];

function Shot({ src, title, priority }: { src: string; title: string; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border-2 border-ink bg-white shadow-brut">
      <div className="flex items-center gap-1.5 border-b-2 border-ink bg-white px-3 py-2" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
      </div>
      <img src={src} alt={`Screenshot: ${title}`} width={1280} height={800} loading={priority ? 'eager' : 'lazy'} decoding="async" className="block aspect-[16/10] w-full object-cover object-top" />
    </div>
  );
}

// ---------- landing ----------

const FEATURES = [
  { title: 'No more paper disqualifications', body: 'Every permit and certificate is tracked. You get email and SMS warnings weeks before anything expires, and each packet is checked against the requirements before you submit.', icon: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7zM9 12l2 2 4-4' },
  { title: 'Bid packets in hours', body: 'Pick a template. Licitatio finds the matching documents, fills in your project, personnel and equipment schedules, and exports one indexed PDF.', icon: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6' },
  { title: 'Proposals without starting over', body: 'Reuse saved text, let your company details fill themselves in, and draft sections with AI. Export to Word or PDF.', icon: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4' },
  { title: 'Every deadline in view', body: 'All bids on one board with countdowns, reminders and assigned tasks, so nothing slips.', icon: 'M8 2v4M16 2v4M3 9h18M5 5h14v16H5z' },
  { title: 'Learn from every result', body: 'Record the winning bid and see your win rate and how far your pricing was from the winner.', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { title: 'Built for the Philippines', body: 'PhilGEPS and DPWH-style requirements, PCAB categories, GCash payments, SMS reminders and Filipino.', icon: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4' },
];

const STEPS = [
  { n: '1', title: 'Upload your documents once', body: 'Permits, licenses, financial statements and your company profile.' },
  { n: '2', title: 'Add a bid', body: 'Enter the reference number and deadline, then choose a requirement template.' },
  { n: '3', title: 'Fix what is flagged', body: 'Missing or expiring items show up in red before the deadline, not after.' },
  { n: '4', title: 'Export and submit', body: 'One indexed PDF packet and your proposal, ready to print or upload.' },
];

const PRICING: Array<{ code: 'starter' | 'pro' | 'desk'; name: string; for: string; points: string[]; featured?: boolean }> = [
  { code: 'starter', name: 'Starter', for: 'Small teams starting out', points: ['3 users', '1 GB storage', '10 active bids', '20 packet exports a month'] },
  { code: 'pro', name: 'Pro', for: 'Contractors who bid every month', points: ['10 users', '5 GB storage', 'Unlimited bids', 'Proposal builder', '100 exports a month'], featured: true },
  { code: 'desk', name: 'Desk', for: 'Let our team prepare packets for you', points: ['15 users', '10 GB storage', 'Unlimited exports', 'Semivra staff prepare bids with you'] },
];

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

export function Landing() {
  const hero = SHOTS[0];
  return (
    <PublicLayout>
      <section className="relative overflow-hidden border-b-2 border-ink bg-paper">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-2">
          <div>
            <p className="inline-flex rounded-md border-2 border-ink bg-accent-300 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-ink">For Philippine contractors</p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] text-ink sm:text-[3.25rem]">Never lose a bid to a missing permit again.</h1>
            <p className="mt-6 text-lg font-medium text-slate-700">Licitatio keeps your documents, track record and bids in one place, warns you before anything expires, and builds your bid packet and proposal in hours instead of days.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className="rounded-lg press border-2 border-ink bg-ink text-accent-300 shadow-brut hover:shadow-brut-sm px-6 py-3.5 text-center text-base font-bold">Start your {TRIAL_DAYS}-day free trial</Link>
              <Link to="/gallery" className="rounded-lg press border-2 border-ink bg-white text-ink shadow-brut hover:shadow-brut-sm px-6 py-3.5 text-center text-base font-bold">See the app</Link>
            </div>
            <p className="mt-5 text-sm text-slate-600">No credit card needed. Works on phone, tablet and computer.</p>
          </div>
          {hero && <Shot src={hero.src} title={hero.title} priority />}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20" aria-labelledby="features-h">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="features-h" className="text-3xl font-bold text-ink sm:text-4xl">Everything a bid needs, ready when you are</h2>
          <p className="mt-3 text-slate-600">Made with contractors who bid on government and private projects.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="press rounded-xl border-2 border-ink bg-white p-6 shadow-brut-sm hover:shadow-brut">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg border-2 border-ink bg-accent-400 text-ink"><Icon d={f.icon} /></span>
              <h3 className="mt-5 text-xl font-bold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y-2 border-ink bg-brand-900 py-16 text-white sm:py-20" aria-labelledby="how-h">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="how-h" className="text-center text-3xl font-bold sm:text-4xl">How it works</h2>
          <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-xl border-2 border-ink bg-white p-6 text-ink shadow-[4px_4px_0_0_#ffd60a]">
                <span className="flex h-11 w-11 items-center justify-center rounded-md border-2 border-ink bg-accent-400 font-display text-lg font-bold text-ink">{s.n}</span>
                <h3 className="mt-4 text-lg font-bold text-ink">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20" aria-labelledby="pricing-h">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="pricing-h" className="text-3xl font-bold text-ink sm:text-4xl">Simple monthly pricing</h2>
          <p className="mt-3 text-slate-600">Every plan starts with a {TRIAL_DAYS}-day free trial. Pay yearly and get 2 months free.</p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PRICING.map((p) => (
            <div key={p.code} className={cx('flex flex-col rounded-2xl border-2 p-7', p.featured ? 'border-ink bg-accent-300 shadow-brut' : 'border-ink bg-white shadow-brut-sm')}>
              {p.featured && <span className="mb-3 self-start rounded-md border-2 border-ink bg-accent-300 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-ink">Most popular</span>}
              <h3 className="text-2xl font-bold text-ink">{p.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{p.for}</p>
              <p className="mt-5"><span className="font-display text-4xl font-bold tracking-tight text-ink">PHP {formatCentavos(PLAN_PRICES[p.code]).replace(/\.00$/, '')}</span><span className="text-sm text-slate-500"> / month</span></p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-slate-700">
                {p.points.map((x) => <li key={x} className="flex gap-2"><svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M5 12l5 5L20 7" /></svg>{x}</li>)}
              </ul>
              <Link to="/register" className={cx('mt-7 rounded-lg px-4 py-3 text-center text-sm font-bold', p.featured ? 'press border-2 border-ink bg-ink text-accent-300 shadow-brut' : 'press border-2 border-ink bg-accent-400 text-ink shadow-brut')}>Start free trial</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-5xl rounded-2xl border-2 border-ink bg-brand-900 px-6 py-12 text-center text-white shadow-[5px_5px_0_0_#ffd60a] sm:px-12">
          <h2 className="text-2xl font-bold sm:text-4xl">Your next bid deserves a complete packet.</h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-100">Set up your workspace in minutes. Bring your permits; we will handle the reminders.</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/register" className="rounded-lg press border-2 border-ink bg-accent-400 text-ink shadow-brut hover:shadow-brut-sm px-6 py-3.5 font-bold">Start free trial</Link>
            <Link to="/install" className="press rounded-lg border-2 border-white px-6 py-3.5 font-bold text-white hover:bg-white/10">Install on your phone</Link>
          </div>
        </div>
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
      <div className="mx-auto max-w-3xl space-y-12 px-4 py-14 text-slate-700">
        <section>
          <h2 className="text-3xl font-bold text-ink">Why we built it</h2>
          <p className="mt-4 leading-relaxed">In public bidding, a strong technical offer and a good price can still lose to one expired permit or a missing certificate. Most firms track their documents in folders and spreadsheets, and the same schedules are retyped for every bid. We built Licitatio so that the paperwork is ready before the invitation to bid arrives.</p>
        </section>
        <section>
          <h2 className="text-3xl font-bold text-ink">What we believe</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              ['You stay in control', 'Licitatio prepares and checks. Your team reviews every export and submits it. We never submit bids for you.'],
              ['Your data is yours', 'Export everything at any time. Each company\'s data is kept separate from every other company.'],
              ['Simple beats clever', 'Clear screens that work on a phone at the site office, not only on a desktop.'],
              ['Local first', 'Philippine requirements, peso pricing, GCash, SMS and Filipino.'],
            ].map(([t, b]) => (
              <li key={t} className="rounded-xl border-2 border-ink bg-white p-5 shadow-brut"><p className="font-semibold text-slate-900">{t}</p><p className="mt-1.5 text-sm">{b}</p></li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-3xl font-bold text-ink">About Semivra</h2>
          <p className="mt-4 leading-relaxed">Semivra is the company behind Licitatio. Besides the software, our desk team can prepare bid packets with you on the Desk plan, working inside your workspace only with access you grant, for a limited time, with every action recorded in your audit log.</p>
        </section>
        <div className="rounded-xl border-2 border-ink bg-accent-400 p-6 text-center shadow-brut-sm">
          <p className="font-semibold text-slate-900">Want to see it with your own documents?</p>
          <Link to="/register" className="mt-4 inline-block rounded-lg press border-2 border-ink bg-white text-ink shadow-brut hover:shadow-brut-sm px-6 py-3 font-bold">Start free trial</Link>
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
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2">
        {SHOTS.map((s, i) => (
          <figure key={s.src}>
            <button type="button" className="press block w-full text-left" onClick={() => setZoom(i)} aria-label={`Enlarge ${s.title}`}>
              <Shot src={s.src} title={s.title} priority={i < 2} />
            </button>
            <figcaption className="mt-4"><p className="font-display text-xl font-bold text-ink">{s.title}</p><p className="mt-1 text-sm text-slate-600">{s.body}</p></figcaption>
          </figure>
        ))}
      </div>
      {current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4" role="dialog" aria-modal="true" aria-label={current.title} onClick={() => setZoom(null)}>
          <div className="w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
            <img src={current.src} alt={`Screenshot: ${current.title}`} className="max-h-[80vh] w-full rounded-lg border-2 border-accent-400 object-contain" />
            <div className="mt-3 flex items-center justify-between gap-3 text-white">
              <button type="button" className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20" onClick={() => setZoom((zoom! - 1 + SHOTS.length) % SHOTS.length)}>Previous</button>
              <p className="text-center text-sm font-medium">{current.title}</p>
              <div className="flex gap-2">
                <button type="button" className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20" onClick={() => setZoom((zoom! + 1) % SHOTS.length)}>Next</button>
                <button type="button" className="rounded-md border-2 border-ink bg-accent-400 px-4 py-2 text-sm font-bold text-ink" onClick={() => setZoom(null)}>Close</button>
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
    <div className="mb-8 rounded-lg border-2 border-ink bg-accent-200 p-4 text-sm font-medium text-ink shadow-brut" role="note">
      This policy is being reviewed by our lawyer. The reviewed version will replace this page, and account holders will be told by email before any material change takes effect.
    </div>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 py-12 text-slate-700 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:leading-relaxed [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>;
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
      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="rounded-2xl border-2 border-ink bg-accent-300 p-6 text-center shadow-brut-sm sm:p-8">
          {installed ? (
            <p className="font-bold text-ink">Licitatio is installed on this device.</p>
          ) : event ? (
            <>
              <p className="font-semibold text-slate-900">Your browser can install Licitatio now.</p>
              <button type="button" onClick={() => void install()} className="mt-4 rounded-lg press border-2 border-ink bg-ink text-accent-300 shadow-brut hover:shadow-brut-sm px-6 py-3 font-bold">Install Licitatio</button>
            </>
          ) : (
            <p className="text-slate-700">Follow the steps for your device below. If you do not see an install option, open this page in Chrome, Edge or Safari.</p>
          )}
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PLATFORMS.map((p) => (
            <section key={p.name} className="rounded-xl border-2 border-ink bg-white p-6 shadow-brut-sm">
              <h2 className="text-xl font-bold text-ink">{p.name}</h2>
              <ol className="mt-4 space-y-3 text-sm text-slate-700">
                {p.steps.map((s, i) => <li key={s} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-accent-400 text-xs font-bold text-ink">{i + 1}</span><span>{s}</span></li>)}
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
