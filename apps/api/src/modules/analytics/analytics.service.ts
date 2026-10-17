import type { AnalyticsDto, Opportunity } from '@licitatio/shared';
import { addDays } from '@licitatio/shared';
import { opportunitiesInRange, packetsFor } from '../../repositories/analytics';
import { evaluateStoredPacket } from '../../repositories/packetEvaluation';
import type { OrgAccess } from '../auth/access';

const DAY = 86_400_000;
const manilaStart = (date: string): Date => new Date(`${date}T00:00:00+08:00`);

/** Top entries of a label count, most frequent first, labels normalized for grouping. */
function tally(labels: Array<string | undefined>, top = 8): Array<{ label: string; count: number }> {
  const counts = new Map<string, { label: string; count: number }>();
  for (const raw of labels) {
    const label = raw?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const e = counts.get(key) ?? { label, count: 0 };
    e.count++;
    counts.set(key, e);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, top);
}

const reasonFor = (o: Opportunity, status: string): string | undefined => [...o.statusHistory].reverse().find((h) => h.to === status)?.reason;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : Math.round(((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

export async function analytics(access: OrgAccess, q: { from?: string; to?: string }): Promise<AnalyticsDto> {
  const opps = await opportunitiesInRange(access.orgId, q.from ? manilaStart(q.from) : undefined, q.to ? manilaStart(addDays(q.to, 1)) : undefined);
  const byStatus: Record<string, number> = {};
  for (const o of opps) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
  const awarded = opps.filter((o) => o.status === 'awarded');
  const lost = opps.filter((o) => o.status === 'lost');
  const decided = awarded.length + lost.length;
  const daysToSubmit = opps.flatMap((o) => {
    const created = o.statusHistory.find((h) => h.from === null)?.at ?? o.createdAt;
    const submitted = o.statusHistory.find((h) => h.to === 'submitted')?.at;
    return submitted ? [Math.max(0, Math.round((new Date(submitted).getTime() - new Date(created).getTime()) / DAY))] : [];
  });

  // what keeps packets of bids still in play from being ready
  const active = opps.filter((o) => ['identified', 'evaluating', 'preparing', 'ready'].includes(o.status));
  const packets = await packetsFor(access.orgId, active.map((o) => o._id));
  const oppById = new Map(active.map((o) => [String(o._id), o]));
  const blockerLabels: string[] = [];
  for (const p of packets) {
    const o = oppById.get(String(p.opportunityId));
    if (!o) continue;
    const ev = await evaluateStoredPacket(p, o);
    const labelOf = new Map(p.items.map((i) => [String(i._id), i.label]));
    for (const b of ev.blockers) blockerLabels.push(labelOf.get(b.itemId) ?? b.key);
  }

  return {
    range: { from: q.from, to: q.to },
    byStatus,
    decided: { awarded: awarded.length, lost: lost.length, winRatePercent: decided === 0 ? null : Math.round((awarded.length / decided) * 100) },
    awardedValue: awarded.reduce((sum, o) => sum + (o.outcome?.ourBidAmount ?? o.approvedBudget ?? 0), 0),
    disqualifications: lost.filter((o) => o.outcome?.disqualified).length,
    lostReasons: tally(lost.map((o) => reasonFor(o, 'lost'))),
    noBidReasons: tally(opps.filter((o) => o.status === 'no_bid').map((o) => reasonFor(o, 'no_bid'))),
    disqualifiedFor: tally(lost.filter((o) => o.outcome?.disqualified).map((o) => o.outcome?.disqualifiedFor ?? 'Not recorded')),
    topBlockers: tally(blockerLabels),
    medianDaysToSubmit: median(daysToSubmit),
  };
}
