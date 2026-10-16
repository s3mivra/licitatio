const dateFmt = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** YYYY-MM-DD calendar dates render without time zone shifts. */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export const formatDate = (iso: string | null | undefined): string => (iso ? dateFmt.format(new Date(iso)) : '');
export const formatDateTime = (iso: string | null | undefined): string => (iso ? dateTimeFmt.format(new Date(iso)) : '');

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function relativeDays(days: number | null): string {
  if (days === null) return 'No expiry';
  if (days < 0) return `Expired ${-days} day${days === -1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

export const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
