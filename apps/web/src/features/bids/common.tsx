import { useQuery } from '@tanstack/react-query';
import type { AssigneeOptionDto, OpportunityStatus } from '@licitatio/shared';
import { api } from '../../lib/api';
import { useOrgId } from '../../lib/queries';
import { Chip } from '../../ui';

export const STATUS_LABEL: Record<OpportunityStatus, string> = {
  identified: 'Identified', evaluating: 'Evaluating', preparing: 'Preparing', ready: 'Ready', submitted: 'Submitted',
  opened: 'Opened', awarded: 'Awarded', lost: 'Lost', no_bid: 'No bid', cancelled: 'Cancelled',
};
export const BOARD_COLUMNS: OpportunityStatus[] = ['identified', 'evaluating', 'preparing', 'ready', 'submitted', 'opened'];
export const TERMINAL: OpportunityStatus[] = ['awarded', 'lost', 'no_bid', 'cancelled'];

/** Same graph as the API; the server enforces it again. */
export const NEXT: Record<OpportunityStatus, OpportunityStatus[]> = {
  identified: ['evaluating', 'no_bid', 'cancelled'],
  evaluating: ['preparing', 'no_bid', 'cancelled'],
  preparing: ['ready', 'evaluating', 'no_bid', 'cancelled'],
  ready: ['submitted', 'preparing', 'cancelled'],
  submitted: ['opened', 'cancelled'],
  opened: ['awarded', 'lost', 'cancelled'],
  awarded: [], lost: [], no_bid: [], cancelled: [],
};

/** Manila wall clock <-> ISO. datetime-local values carry no zone, so +08:00 is explicit. */
export const manilaInputToIso = (v: string): string | undefined => (v ? `${v}:00+08:00` : undefined);
export function isoToManilaInput(iso: string | undefined): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Red at 3 days or fewer, amber at 7 or fewer. */
export function DeadlineChip({ iso, status }: { iso: string; status: OpportunityStatus }) {
  if (TERMINAL.includes(status) || ['submitted', 'opened'].includes(status)) return null;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <Chip tone="red">Past due</Chip>;
  if (days <= 3) return <Chip tone="red">{days === 0 ? 'Due today' : `${days}d left`}</Chip>;
  if (days <= 7) return <Chip tone="amber">{days}d left</Chip>;
  return null;
}

export function StatusChip({ status }: { status: OpportunityStatus }) {
  const tone = status === 'awarded' ? 'green' : status === 'lost' || status === 'cancelled' || status === 'no_bid' ? 'slate' : status === 'ready' ? 'green' : 'blue';
  return <Chip tone={tone}>{STATUS_LABEL[status]}</Chip>;
}

export function useAssignees() {
  const orgId = useOrgId();
  return useQuery({ queryKey: ['org', orgId, 'assignees'], queryFn: () => api.get<{ data: AssigneeOptionDto[] }>(`/orgs/${orgId}/assignees`).then((r) => r.data), staleTime: 60_000 });
}
