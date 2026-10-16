import { describe, expect, it } from 'vitest';
import type { Equipment, ExperienceProject, Opportunity, Organization, Personnel } from '@licitatio/shared';
import { buildVariableMap, expandDataTable, resolveProposal, substitute } from './resolve';
import type { ResolveData } from './resolve';
import { COMPLETED_LOOKBACK_MONTHS, ScheduleEmptyError, buildSchedule } from './schedules';

const org = {
  _id: 'o', name: 'Bayanihan', tradeName: undefined, slug: 'b',
  profile: {
    legalName: 'Bayanihan Builders Corporation', address: { line1: '88 Ortigas Ave.', city: 'Pasig City', province: 'Metro Manila', postalCode: '1600' },
    yearEstablished: 2009, registrations: { pcabCategory: 'AA' }, signatory: { name: 'Ramon Santos', position: 'President' }, narrative: {},
  },
} as unknown as Organization;
const project = (over: Partial<ExperienceProject>): ExperienceProject => ({
  _id: 'p', name: 'School', clientName: 'DepEd', clientType: 'government', location: 'Pasig', category: 'Buildings', role: 'main',
  contractAmount: 100_00, status: 'completed', completionDate: '2025-01-01', photoFileIds: [], ...over,
} as ExperienceProject);
const data = (over: Partial<ResolveData> = {}): ResolveData => ({ org, opportunity: null, projects: [], personnel: [], equipment: [], today: '2026-10-16', ...over });

describe('variables', () => {
  it('substitutes known values and marks unresolved ones', () => {
    const unresolved = new Set<string>();
    expect(substitute('{{org.legalName}} / {{ org.pcabCategory }} / {{opp.title}}', buildVariableMap(data()), unresolved)).toBe('Bayanihan Builders Corporation / AA / [opp.title]');
    expect([...unresolved]).toEqual(['opp.title']);
  });
  it('formats address, years in business, opportunity values and stats', () => {
    const opp = { title: 'Road', procuringEntity: 'DPWH', approvedBudget: 125_000_050, submissionDeadlineAt: new Date('2026-10-14T02:00:00Z') } as Opportunity;
    const vars = buildVariableMap(data({ opportunity: opp, projects: [project({ contractAmount: 100_00 }), project({ _id: 'q', contractAmount: 50_00 }), project({ _id: 'r', status: 'ongoing' })] }));
    expect(vars['org.address']).toBe('88 Ortigas Ave., Pasig City, Metro Manila 1600');
    expect(vars['org.yearsInBusiness']).toBe('17');
    expect(vars['opp.approvedBudget']).toBe('1,250,000.50');
    expect(vars['opp.submissionDate']).toBe('October 14, 2026');
    expect(vars['stats.completedProjectCount']).toBe('2');
    expect(vars['stats.completedProjectValue']).toBe('150.00');
    expect(vars['org.tin']).toBe('');
  });
});

describe('resolveProposal', () => {
  it('resolves every node type', () => {
    const { resolved, unresolved } = resolveProposal({
      title: 'Proposal for {{opp.title}}',
      sections: [{
        title: 'About {{org.legalName}}',
        nodes: [
          { type: 'heading', level: 2, runs: [{ text: 'Since {{org.yearEstablished}}', bold: true }] },
          { type: 'paragraph', runs: [{ text: 'Hello', italic: true }] },
          { type: 'list', ordered: true, items: [[{ text: '{{signatory.name}}' }]] },
          { type: 'table', header: ['A'], rows: [['{{org.pcabCategory}}']] },
          { type: 'dataTable', source: 'equipment', limit: 5 },
          { type: 'image', fileId: 'a'.repeat(24), widthPercent: 50, caption: 'Site' },
          { type: 'pageBreak' },
        ],
      }],
    }, data({ equipment: [{ _id: 'e', name: 'Backhoe', type: 'Excavator', quantity: 2, ownership: 'owned', condition: 'needs_repair' } as Equipment] }));
    expect(unresolved).toEqual(['opp.title']);
    expect(resolved.title).toBe('Proposal for [opp.title]');
    expect(resolved.sections[0]?.title).toBe('About Bayanihan Builders Corporation');
    const nodes = resolved.sections[0]?.nodes ?? [];
    expect(nodes.map((n) => n.type)).toEqual(['heading', 'paragraph', 'list', 'table', 'table', 'image', 'pageBreak']);
    expect(nodes[3]).toEqual({ type: 'table', header: ['A'], rows: [['AA']] });
    expect(nodes[4]).toMatchObject({ rows: [['Backhoe', 'Excavator', '', '2', 'Owned', 'needs repair']] });
  });
});

describe('data tables', () => {
  it('sorts projects with completion dates first, newest first, and filters', () => {
    const projects = [project({ _id: '1', name: 'Old', completionDate: '2020-01-01' }), project({ _id: '2', name: 'New', completionDate: '2025-06-01' }), project({ _id: '3', name: 'Running', status: 'ongoing', completionDate: undefined })];
    expect(expandDataTable({ type: 'dataTable', source: 'projects', limit: 10 }, data({ projects })).rows.map((r) => r[0])).toEqual(['New', 'Old', 'Running']);
    expect(expandDataTable({ type: 'dataTable', source: 'projects', limit: 1, filter: 'completed' }, data({ projects })).rows.map((r) => r[0])).toEqual(['New']);
    expect(expandDataTable({ type: 'dataTable', source: 'projects', limit: 10, filter: 'ongoing' }, data({ projects })).rows.map((r) => r[0])).toEqual(['Running']);
  });
  it('puts key personnel first', () => {
    const personnel = [{ _id: '1', fullName: 'Zed', position: 'PE', isKeyPersonnel: true }, { _id: '2', fullName: 'Amy', position: 'Foreman', isKeyPersonnel: false }] as Personnel[];
    expect(expandDataTable({ type: 'dataTable', source: 'personnel', limit: 10 }, data({ personnel })).rows.map((r) => r[0])).toEqual(['Zed', 'Amy']);
    expect(expandDataTable({ type: 'dataTable', source: 'personnel', limit: 10, filter: 'key' }, data({ personnel })).rows).toHaveLength(1);
  });
});

describe('schedules', () => {
  it('lists completed contracts in the look-back window and names the largest', () => {
    const projects = [
      project({ _id: '1', name: 'Big', contractAmount: 900_00, completionDate: '2024-01-01' }),
      project({ _id: '2', name: 'Ancient', contractAmount: 99_900_00, completionDate: '2010-01-01' }),
    ];
    const s = buildSchedule('completed_projects', data({ projects }));
    const nodes = s.sections[0]?.nodes ?? [];
    expect(nodes[0]).toMatchObject({ type: 'table', rows: [['Big', 'DepEd', 'Pasig', 'Main contractor', '900.00', '2024-01-01', 'Completed']] });
    expect(JSON.stringify(nodes[1])).toContain('Single largest completed contract: Big');
    expect(JSON.stringify(nodes)).toContain('Ramon Santos');
    expect(COMPLETED_LOOKBACK_MONTHS).toBe(120);
  });
  it('throws ScheduleEmptyError for every generator with no records', () => {
    for (const code of ['completed_projects', 'ongoing_projects', 'personnel_list', 'equipment_list'] as const) {
      expect(() => buildSchedule(code, data())).toThrow(ScheduleEmptyError);
    }
  });
  it('builds ongoing, personnel and equipment schedules', () => {
    expect(buildSchedule('ongoing_projects', data({ projects: [project({ status: 'ongoing' })] })).title).toBe('Statement of ongoing contracts');
    expect(buildSchedule('personnel_list', data({ personnel: [{ _id: '1', fullName: 'A', position: 'PE', isKeyPersonnel: true } as Personnel] })).title).toBe('List of key personnel');
    expect(buildSchedule('equipment_list', data({ equipment: [{ _id: 'e', name: 'Mixer', type: 'Mixer', quantity: 1, ownership: 'leased', condition: 'good' } as Equipment] })).title).toBe('List of equipment');
  });
});
