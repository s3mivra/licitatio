import type { BlockNode, BlockRun, DateOnly, Equipment, ExperienceProject, Opportunity, Organization, Personnel } from '@licitatio/shared';
import { formatCentavos, manilaDateOf } from '@licitatio/shared';

export interface ResolvedRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}
export type ResolvedNode =
  | { type: 'heading'; level: 1 | 2 | 3; runs: ResolvedRun[] }
  | { type: 'paragraph'; runs: ResolvedRun[] }
  | { type: 'list'; ordered: boolean; items: ResolvedRun[][] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'image'; fileId: string; widthPercent: number; caption?: string }
  | { type: 'pageBreak' };
export interface ResolvedSection {
  title: string;
  nodes: ResolvedNode[];
}
export interface ResolvedProposal {
  title: string;
  bidder: string;
  generatedOn: DateOnly;
  sections: ResolvedSection[];
}
export interface ResolveData {
  org: Organization;
  opportunity: Opportunity | null;
  projects: ExperienceProject[];
  personnel: Personnel[];
  equipment: Equipment[];
  today: DateOnly;
}

const TOKEN = /\{\{\s*([a-z][a-zA-Z0-9_.]*)\s*\}\}/g;

/** A variable resolves only if its source value is present and non-empty; otherwise [name] stays in place. */
export function substitute(text: string, vars: Readonly<Record<string, string>>, unresolved: Set<string>): string {
  return text.replace(TOKEN, (_match, name: string) => {
    const value = vars[name];
    if (value !== undefined && value !== '') return value;
    unresolved.add(name);
    return `[${name}]`;
  });
}

function longDate(value: DateOnly): string {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function formatAddress(a: Organization['profile']['address'] | undefined): string {
  if (!a) return '';
  const tail = [a.province, a.postalCode].filter(Boolean).join(' ');
  return [a.line1, a.line2, a.city, tail].filter((p) => p && p.length > 0).join(', ');
}

export function buildVariableMap(data: ResolveData): Record<string, string> {
  const { org, opportunity: opp, projects, today } = data;
  const p = org.profile;
  const completed = projects.filter((x) => x.status === 'completed');
  const thisYear = Number(today.slice(0, 4));
  const vars: Record<string, string> = {
    'org.legalName': p.legalName,
    'org.tradeName': org.tradeName ?? '',
    'org.address': formatAddress(p.address),
    'org.phone': p.phone ?? '',
    'org.email': p.email ?? '',
    'org.website': p.website ?? '',
    'org.yearEstablished': p.yearEstablished ? String(p.yearEstablished) : '',
    'org.yearsInBusiness': p.yearEstablished ? String(Math.max(0, thisYear - p.yearEstablished)) : '',
    'org.pcabLicenseNo': p.registrations?.pcabLicenseNo ?? '',
    'org.pcabCategory': p.registrations?.pcabCategory ?? '',
    'org.tin': p.registrations?.tin ?? '',
    'org.philgepsNo': p.registrations?.philgepsNo ?? '',
    'signatory.name': p.signatory?.name ?? '',
    'signatory.position': p.signatory?.position ?? '',
    'stats.completedProjectCount': completed.length > 0 ? String(completed.length) : '',
    'stats.completedProjectValue': completed.length > 0 ? formatCentavos(completed.reduce((s, x) => s + x.contractAmount, 0)) : '',
    'date.today': longDate(today),
  };
  if (opp) {
    vars['opp.title'] = opp.title;
    vars['opp.referenceNo'] = opp.referenceNo ?? '';
    vars['opp.procuringEntity'] = opp.procuringEntity;
    vars['opp.location'] = opp.location ?? '';
    vars['opp.approvedBudget'] = opp.approvedBudget ? formatCentavos(opp.approvedBudget) : '';
    vars['opp.submissionDate'] = longDate(manilaDateOf(opp.submissionDeadlineAt));
    vars['opp.submissionDeadline'] = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(opp.submissionDeadlineAt);
  }
  return vars;
}

const PROJECT_HEADER = ['Project', 'Client', 'Location', 'Role', 'Contract amount (PHP)', 'Completed', 'Status'];
const PERSONNEL_HEADER = ['Name', 'Position', 'Profession', 'License no.', 'Years of experience'];
const EQUIPMENT_HEADER = ['Equipment', 'Type', 'Make and model', 'Qty', 'Ownership', 'Condition'];
const ROLE_LABEL = { main: 'Main contractor', subcontractor: 'Subcontractor', joint_venture: 'Joint venture' } as const;
const cmp = (a: string | undefined, b: string | undefined): number => (b ?? '').localeCompare(a ?? '');
const idOf = (x: { _id: unknown }): string => String(x._id);

export function expandDataTable(
  node: Extract<BlockNode, { type: 'dataTable' }>,
  data: Pick<ResolveData, 'projects' | 'personnel' | 'equipment'>,
): Extract<ResolvedNode, { type: 'table' }> {
  if (node.source === 'projects') {
    const rows = data.projects
      .filter((p) => (node.filter === 'completed' ? p.status === 'completed' : node.filter === 'ongoing' ? p.status === 'ongoing' : true))
      .sort((a, b) => (a.completionDate ? 0 : 1) - (b.completionDate ? 0 : 1) || cmp(a.completionDate, b.completionDate) || cmp(a.startDate, b.startDate) || idOf(a).localeCompare(idOf(b)))
      .slice(0, node.limit)
      .map((p) => [p.name, p.clientName, p.location, ROLE_LABEL[p.role], formatCentavos(p.contractAmount), p.completionDate ?? '', p.status === 'completed' ? 'Completed' : 'Ongoing']);
    return { type: 'table', header: PROJECT_HEADER, rows };
  }
  if (node.source === 'personnel') {
    const rows = data.personnel
      .filter((p) => (node.filter === 'key' ? p.isKeyPersonnel : true))
      .sort((a, b) => Number(b.isKeyPersonnel) - Number(a.isKeyPersonnel) || a.fullName.localeCompare(b.fullName) || idOf(a).localeCompare(idOf(b)))
      .slice(0, node.limit)
      .map((p) => [p.fullName, p.position, p.profession ?? '', p.licenseNo ?? '', p.yearsExperience === undefined ? '' : String(p.yearsExperience)]);
    return { type: 'table', header: PERSONNEL_HEADER, rows };
  }
  const rows = [...data.equipment]
    .sort((a, b) => a.name.localeCompare(b.name) || idOf(a).localeCompare(idOf(b)))
    .slice(0, node.limit)
    .map((e) => [e.name, e.type, [e.make, e.model].filter(Boolean).join(' '), String(e.quantity), e.ownership === 'owned' ? 'Owned' : 'Leased', e.condition.replace('_', ' ')]);
  return { type: 'table', header: EQUIPMENT_HEADER, rows };
}

function resolveRuns(runs: BlockRun[], vars: Record<string, string>, unresolved: Set<string>): ResolvedRun[] {
  return runs.map((r) => ({ text: substitute(r.text, vars, unresolved), bold: r.bold, italic: r.italic }));
}

export function resolveNodes(nodes: readonly BlockNode[], data: ResolveData, vars: Record<string, string>, unresolved: Set<string>): ResolvedNode[] {
  return nodes.map((n): ResolvedNode => {
    switch (n.type) {
      case 'heading': return { type: 'heading', level: n.level, runs: resolveRuns(n.runs, vars, unresolved) };
      case 'paragraph': return { type: 'paragraph', runs: resolveRuns(n.runs, vars, unresolved) };
      case 'list': return { type: 'list', ordered: n.ordered, items: n.items.map((i) => resolveRuns(i, vars, unresolved)) };
      case 'table': return { type: 'table', header: n.header.map((h) => substitute(h, vars, unresolved)), rows: n.rows.map((r) => r.map((c) => substitute(c, vars, unresolved))) };
      case 'dataTable': return expandDataTable(n, data);
      case 'image': return { type: 'image', fileId: n.fileId, widthPercent: n.widthPercent, caption: n.caption };
      case 'pageBreak': return { type: 'pageBreak' };
    }
  });
}

export function resolveProposal(
  proposal: { title: string; sections: Array<{ title: string; nodes: BlockNode[] }> },
  data: ResolveData,
): { resolved: ResolvedProposal; unresolved: string[] } {
  const vars = buildVariableMap(data);
  const unresolved = new Set<string>();
  const resolved: ResolvedProposal = {
    title: substitute(proposal.title, vars, unresolved),
    bidder: data.org.profile.legalName,
    generatedOn: data.today,
    sections: proposal.sections.map((s) => ({ title: substitute(s.title, vars, unresolved), nodes: resolveNodes(s.nodes, data, vars, unresolved) })),
  };
  return { resolved, unresolved: [...unresolved].sort() };
}
