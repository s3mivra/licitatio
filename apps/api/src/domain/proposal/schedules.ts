import type { GeneratorCode } from '@licitatio/shared';
import { addMonths, computeNfcc, formatCentavos } from '@licitatio/shared';
import { expandDataTable } from './resolve';
import type { ResolveData, ResolvedNode, ResolvedProposal } from './resolve';

/** Look-back for completed contracts. A constant for the civil engineer to confirm against current rules. */
export const COMPLETED_LOOKBACK_MONTHS = 120;

export const SCHEDULE_TITLES: Record<GeneratorCode, string> = {
  completed_projects: 'Statement of completed contracts',
  ongoing_projects: 'Statement of ongoing contracts',
  personnel_list: 'List of key personnel',
  equipment_list: 'List of equipment',
  nfcc: 'Computation of net financial contracting capacity',
};

const para = (text: string, bold = false): ResolvedNode => ({ type: 'paragraph', runs: [{ text, bold }] });

export class ScheduleEmptyError extends Error {
  constructor(message = 'No records to list') {
    super(message);
    this.name = 'ScheduleEmptyError';
  }
}

/**
 * Supporting schedules, not the procuring entity's prescribed forms. A footer line says so,
 * and the user can replace any generated file with an uploaded official form.
 */
export function buildSchedule(code: GeneratorCode, data: ResolveData): ResolvedProposal {
  const nodes: ResolvedNode[] = [];
  if (code === 'completed_projects') {
    const since = addMonths(data.today, -COMPLETED_LOOKBACK_MONTHS);
    const recent = data.projects.filter((p) => p.status === 'completed' && (p.completionDate ?? '') >= since);
    if (recent.length === 0) throw new ScheduleEmptyError();
    nodes.push(expandDataTable({ type: 'dataTable', source: 'projects', limit: 50, filter: 'completed' }, { ...data, projects: recent }));
    const largest = [...recent].sort(
      (a, b) => b.contractAmount - a.contractAmount || (b.completionDate ?? '').localeCompare(a.completionDate ?? '') || String(a._id).localeCompare(String(b._id)),
    )[0];
    if (largest) {
      nodes.push(para(`Single largest completed contract: ${largest.name}, ${formatCentavos(largest.contractAmount)} PHP, completed ${largest.completionDate ?? ''}.`, true));
    }
  } else if (code === 'ongoing_projects') {
    const table = expandDataTable({ type: 'dataTable', source: 'projects', limit: 50, filter: 'ongoing' }, data);
    if (table.rows.length === 0) throw new ScheduleEmptyError();
    nodes.push(table);
  } else if (code === 'personnel_list') {
    const table = expandDataTable({ type: 'dataTable', source: 'personnel', limit: 50, filter: 'key' }, data);
    if (table.rows.length === 0) throw new ScheduleEmptyError();
    nodes.push(table);
  } else if (code === 'nfcc') {
    const f = data.org.profile.financials;
    if (f?.currentAssets === undefined || f.currentLiabilities === undefined) throw new ScheduleEmptyError('Enter current assets and current liabilities in the company profile');
    const r = computeNfcc({
      currentAssets: f.currentAssets, currentLiabilities: f.currentLiabilities, otherCommitments: f.otherCommitments,
      ongoing: data.projects.filter((p) => p.status === 'ongoing').map((p) => ({ name: p.name, contractAmount: p.contractAmount, percentComplete: p.percentComplete })),
    });
    const php = (v: number) => `${formatCentavos(v)} PHP`;
    nodes.push(para(`Based on the audited financial statements${f.fiscalYear ? ` for ${f.fiscalYear}` : ''}.`));
    nodes.push({ type: 'table', header: ['Item', 'Amount'], rows: [
      ['Current assets', php(f.currentAssets)],
      ['Less: current liabilities', php(f.currentLiabilities)],
      ['Net working capital', php(r.netWorkingCapital)],
      [`Multiplied by K = ${r.k}`, php(r.capacityBeforeCommitments)],
      ['Less: outstanding works under ongoing contracts and commitments', php(r.outstandingTotal)],
      ['Net financial contracting capacity (NFCC)', php(r.nfcc)],
    ] });
    if (r.outstandingWorks.length > 0 || f.otherCommitments) {
      nodes.push(para('Outstanding works', true));
      nodes.push({ type: 'table', header: ['Contract', 'Value of outstanding works'], rows: [
        ...r.outstandingWorks.map((w) => [w.name, php(w.outstanding)]),
        ...(f.otherCommitments ? [['Awarded contracts not yet started and other commitments', php(f.otherCommitments)]] : []),
      ] });
    }
    if (data.opportunity?.approvedBudget) {
      const abc = data.opportunity.approvedBudget;
      nodes.push(para(`Approved budget for the contract: ${php(abc)}. The NFCC is ${r.nfcc >= abc ? 'at least' : 'below'} the approved budget.`, true));
    }
    nodes.push(para('NFCC = (current assets minus current liabilities) x K minus the value of all outstanding works under ongoing contracts, including awarded contracts yet to be started.'));
  } else {
    const table = expandDataTable({ type: 'dataTable', source: 'equipment', limit: 50 }, data);
    if (table.rows.length === 0) throw new ScheduleEmptyError();
    nodes.push(table);
  }
  const signatory = data.org.profile.signatory;
  nodes.push(
    para(''),
    para('Submitted by:'),
    para('______________________________'),
    para(signatory?.name ?? '', true),
    para(signatory?.position ?? ''),
    para('Supporting schedule generated from the bidder records. Replace with the procuring entity prescribed form where one is required.'),
  );
  return {
    title: SCHEDULE_TITLES[code],
    bidder: data.org.profile.legalName,
    generatedOn: data.today,
    sections: [{ title: `${SCHEDULE_TITLES[code]} as of ${data.today}`, nodes }],
  };
}
