import type { GeneratorCode } from '@licitatio/shared';
import { addMonths, formatCentavos } from '@licitatio/shared';
import { expandDataTable } from './resolve';
import type { ResolveData, ResolvedNode, ResolvedProposal } from './resolve';

/** Look-back for completed contracts. A constant for the civil engineer to confirm against current rules. */
export const COMPLETED_LOOKBACK_MONTHS = 120;

export const SCHEDULE_TITLES: Record<GeneratorCode, string> = {
  completed_projects: 'Statement of completed contracts',
  ongoing_projects: 'Statement of ongoing contracts',
  personnel_list: 'List of key personnel',
  equipment_list: 'List of equipment',
};

const para = (text: string, bold = false): ResolvedNode => ({ type: 'paragraph', runs: [{ text, bold }] });

export class ScheduleEmptyError extends Error {
  constructor() {
    super('No records to list');
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
