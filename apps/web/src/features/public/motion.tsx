import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { cx } from '../../ui';

/** True when the visitor asked the system for less motion; every effect below then shows its final state. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setShown(true); io.disconnect(); } }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);
  return (
    <div ref={ref} style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
      className={cx('transition-[opacity,transform] duration-700 ease-out', reduced || shown ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0', className)}>
      {children}
    </div>
  );
}

/**
 * Types each word, pauses, deletes it and moves to the next, with a blinking caret.
 * Invisible copies of every word reserve the widest one's space so the headline never jumps.
 */
export function TypedWord({ words, className }: { words: readonly string[]; className?: string }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [length, setLength] = useState(words[0]?.length ?? 0);
  const [deleting, setDeleting] = useState(false);
  const word = words[index] ?? '';
  useEffect(() => {
    if (reduced) return undefined;
    let delay = deleting ? 45 : 85;
    if (!deleting && length === word.length) delay = 1900;
    if (deleting && length === 0) delay = 300;
    const t = setTimeout(() => {
      if (!deleting && length === word.length) setDeleting(true);
      else if (deleting && length === 0) { setDeleting(false); setIndex((i) => (i + 1) % words.length); }
      else setLength((n) => n + (deleting ? -1 : 1));
    }, delay);
    return () => clearTimeout(t);
  }, [reduced, deleting, length, word, words.length]);
  const shown = reduced ? words[0] ?? '' : word.slice(0, length);
  return (
    <span className={cx('relative inline-grid align-baseline', className)}>
      {words.map((w) => <span key={w} className="invisible col-start-1 row-start-1 whitespace-nowrap" aria-hidden>{w}</span>)}
      <span className="col-start-1 row-start-1 whitespace-nowrap" aria-hidden>
        {shown}<span className="ml-0.5 inline-block w-[3px] translate-y-[0.08em] animate-caret self-stretch bg-current align-baseline" style={{ height: '0.85em' }} />
      </span>
      <span className="sr-only">{words[0]}</span>
    </span>
  );
}

/** A small dot with a soft ring that pulses outward, for "live" status. */
export function LiveDot({ className = 'bg-emerald-500' }: { className?: string }) {
  return (
    <span className="relative flex h-2 w-2" aria-hidden>
      <span className={cx('absolute inset-0 rounded-full motion-safe:animate-pulse-ring', className)} />
      <span className={cx('relative h-2 w-2 rounded-full', className)} />
    </span>
  );
}

export type FeedItem = { title: string; sub: string; dot: string; icon: string };

/**
 * An activity card where a new event drops in at the top every few seconds and the oldest leaves,
 * so the hero shows the product working. Times count up from "now".
 */
export function LiveFeed({ items, visible = 3, every = 2800 }: { items: readonly FeedItem[]; visible?: number; every?: number }) {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduced) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), every);
    return () => clearInterval(t);
  }, [reduced, every]);
  const rows = Array.from({ length: Math.min(visible, items.length) }, (_, i) => {
    const n = tick - i;
    const item = items[((n % items.length) + items.length) % items.length];
    return item ? { item, key: n, age: i } : null;
  }).filter((r): r is { item: FeedItem; key: number; age: number } => r !== null);
  const ages = ['now', '1m ago', '3m ago', '8m ago'];
  return (
    <ul className="space-y-2.5" aria-label="Example activity">
      {rows.map(({ item, key, age }) => (
        <li key={key} className={cx('flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5', age === 0 && tick > 0 && 'motion-safe:animate-drop')}>
          <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold', item.dot)} aria-hidden>{item.icon}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title}</p><p className="truncate font-mono text-[11px] text-slate-500">{item.sub}</p></div>
          <span className="shrink-0 font-mono text-[11px] text-slate-400">{ages[age] ?? ''}</span>
        </li>
      ))}
    </ul>
  );
}

/** A band that scrolls sideways forever; the content is repeated three times and moved by a third. */
export function Marquee({ children, seconds = 40 }: { children: ReactNode; seconds?: number }) {
  return (
    <div className="group overflow-hidden" aria-hidden>
      <div className="flex w-max motion-safe:animate-marquee group-hover:[animation-play-state:paused]" style={{ animationDuration: `${seconds}s` }}>
        <div className="flex">{children}</div><div className="flex">{children}</div><div className="flex">{children}</div>
      </div>
    </div>
  );
}

/** Counts from zero to the value once it scrolls into view. */
export function CountUp({ to, suffix = '', className }: { to: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? to : 0);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) { setValue(to); return undefined; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / 1200);
        setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, reduced]);
  return <span ref={ref} className={className}>{value}{suffix}</span>;
}
