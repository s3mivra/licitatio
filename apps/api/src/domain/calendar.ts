/**
 * iCalendar (RFC 5545) feed for calendar apps. Timed events are written in UTC; document expiries
 * are all-day events. Lines are folded at 75 characters and text is escaped.
 */
export type CalendarEvent =
  | { uid: string; kind: 'timed'; start: Date; title: string; description?: string; url?: string; alarmMinutes?: number }
  | { uid: string; kind: 'allDay'; date: string; title: string; description?: string; url?: string; alarmMinutes?: number };

const utc = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** Fold to 75 characters per line, continuation lines start with a space. */
export function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join('\r\n');
}

export function buildIcs(name: string, events: readonly CalendarEvent[], now: Date): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Semivra//Licitatio//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`, 'X-WR-TIMEZONE:Asia/Manila', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@licitatio`, `DTSTAMP:${utc(now)}`);
    if (e.kind === 'timed') {
      lines.push(`DTSTART:${utc(e.start)}`, `DTEND:${utc(new Date(e.start.getTime() + 30 * 60_000))}`);
    } else {
      const d = e.date.replace(/-/g, '');
      const next = new Date(`${e.date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`, 'TRANSP:TRANSPARENT');
    }
    lines.push(`SUMMARY:${escape(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.alarmMinutes) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(e.title)}`, `TRIGGER:-PT${e.alarmMinutes}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
