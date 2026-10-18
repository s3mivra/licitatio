import type { z } from 'zod';
import type { PriceSheet, PriceSheetDto, priceSheetBody } from '@licitatio/shared';
import { DEFAULT_MARKUPS, PLANS, checkBudget, computeSheet, formatCentavos, manilaDateOf, roundQty } from '@licitatio/shared';
import type { ResolvedNode, ResolvedProposal } from '../../domain/proposal/resolve';
import { renderProposalPdf } from '../../infra/pdf/renderPdf';
import { storeGeneratedFile } from '../../jobs/exports/storeFile';
import { recordAudit } from '../../repositories/audit';
import { OpportunityRepo } from '../../repositories/opportunities';
import { getOrganization } from '../../repositories/orgs';
import { PriceSheetRepo } from '../../repositories/priceSheets';
import { AppError } from '../../shared/errors';
import { viaOf } from '../../shared/validate';
import type { OrgAccess } from '../auth/access';

async function assertPricingFeature(orgId: string): Promise<void> {
  const org = await getOrganization(orgId);
  if (!PLANS[org.plan].proposals) throw new AppError(403, 'plan_limit', 'Your plan does not include the price builder', { feature: 'pricing' });
}

const toDto = (s: PriceSheet | null, opportunityId: string): PriceSheetDto => ({
  opportunityId,
  rev: s?.rev ?? 0,
  items: s?.items ?? [],
  markups: s?.markups ?? { ...DEFAULT_MARKUPS },
  updatedAt: s?.updatedAt ? new Date(s.updatedAt).toISOString() : undefined,
});

export async function get(access: OrgAccess, opportunityId: string): Promise<PriceSheetDto> {
  await new OpportunityRepo(access.orgId).getLean(opportunityId);
  return toDto(await new PriceSheetRepo(access.orgId).findByOpportunity(opportunityId), opportunityId);
}

export async function save(access: OrgAccess, opportunityId: string, body: z.infer<typeof priceSheetBody>, ip?: string): Promise<PriceSheetDto> {
  await assertPricingFeature(access.orgId);
  await new OpportunityRepo(access.orgId).getLean(opportunityId);
  const items = body.items.map((i) => ({
    ...i, quantity: roundQty(i.quantity),
    components: i.components.map((c) => ({ ...c, quantity: roundQty(c.quantity) })),
  }));
  const saved = await new PriceSheetRepo(access.orgId).save(opportunityId, body.rev, { items, markups: body.markups }, access.userId);
  await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'pricing.save', entityType: 'opportunity', entityId: opportunityId, ip, meta: { items: items.length } });
  return toDto(saved, opportunityId);
}

const php = (v: number): string => formatCentavos(v);
const qty = (q: number): string => q.toLocaleString('en-PH', { maximumFractionDigits: 4 });
const KIND = { material: 'Materials', labor: 'Labor', equipment: 'Equipment' } as const;

/** Bill of quantities and detailed unit price analysis as a PDF. The CSV is built in the browser. */
export async function exportSheet(access: OrgAccess, opportunityId: string, format: 'pdf', ip?: string): Promise<{ fileId: string }> {
  await assertPricingFeature(access.orgId);
  const opp = await new OpportunityRepo(access.orgId).getLean(opportunityId);
  const sheet = await new PriceSheetRepo(access.orgId).findByOpportunity(opportunityId);
  if (!sheet || sheet.items.length === 0) throw new AppError(422, 'validation_failed', 'Add at least one pay item before exporting');
  const t = computeSheet(sheet.items, sheet.markups);
  const org = await getOrganization(access.orgId);
  const bidder = org.profile.legalName || org.name;
  {
    const m = sheet.markups;
    const boq: ResolvedNode[] = [
      { type: 'table', header: ['Item no.', 'Description', 'Unit', 'Quantity', 'Unit price', 'Amount'], rows: [
        ...sheet.items.map((i, idx) => [i.itemNo, i.description, i.unit, qty(i.quantity), php(t.items[idx]?.unitPrice ?? 0), php(t.items[idx]?.amount ?? 0)]),
        ['', 'TOTAL BID PRICE (PHP)', '', '', '', php(t.total)],
      ] },
    ];
    if (opp.approvedBudget) {
      const b = checkBudget(t.total, opp.approvedBudget);
      boq.push({ type: 'paragraph', runs: [{ text: `Approved budget for the contract: PHP ${php(b.approvedBudget)}. The bid price is ${b.percentOfBudget}% of the budget${b.withinBudget ? '.' : ' and EXCEEDS it.'}`, bold: true }] });
    }
    const dupa: ResolvedNode[] = [];
    sheet.items.forEach((i, idx) => {
      const c = t.items[idx];
      if (!c) return;
      dupa.push({ type: 'heading', level: 3, runs: [{ text: `Item ${i.itemNo}: ${i.description} (per ${i.unit})` }] });
      dupa.push({ type: 'table', header: ['Component', 'Description', 'Quantity', 'Unit', 'Unit cost', 'Cost'], rows: [
        ...i.components.map((p) => [KIND[p.kind], p.description, qty(p.quantity), p.unit, php(p.unitCost), php(Math.round(p.quantity * p.unitCost))]),
        ['', 'Direct cost', '', '', '', php(c.direct)],
        ['', `Overhead, contingencies and miscellaneous (${m.ocmPercent}%)`, '', '', '', php(c.ocm)],
        ['', `Profit (${m.profitPercent}%)`, '', '', '', php(c.profit)],
        ['', `VAT (${m.vatPercent}%)`, '', '', '', php(c.vat)],
        ['', 'UNIT PRICE', '', '', '', php(c.unitPrice)],
      ] });
    });
    const doc: ResolvedProposal = {
      title: `Bid price: ${opp.title}`,
      bidder,
      generatedOn: manilaDateOf(new Date()),
      sections: [
        { title: 'Bill of quantities', nodes: boq },
        { title: 'Detailed unit price analysis', nodes: [...dupa, { type: 'paragraph', runs: [{ text: 'Prepared from the bidder records. Use the procuring entity prescribed forms where required.' }] }] },
      ],
    };
    const bytes = await renderProposalPdf(doc, new Map());
    const fileId = await storeGeneratedFile({ orgId: access.orgId, userId: access.userId, originalName: 'bid-price.pdf', mime: 'application/pdf', bytes, area: 'files' });
    await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'pricing.export', entityType: 'opportunity', entityId: opportunityId, ip, meta: { format } });
    return { fileId };
  }
}
