import type { DocCategory, TemplateItem, TemplateMode } from '@licitatio/shared';

/**
 * Seeded defaults from section 5. The civil engineer must review them against the current
 * procurement law and a real invitation to bid before release. They are data: a legal change
 * is an edit here plus `npm run seed-requirements`, not a deploy.
 */
export interface SeedDocType {
  code: string;
  name: string;
  category: DocCategory;
  hasExpiry: boolean;
  defaultValidityMonths?: number;
}

export const SYSTEM_DOCUMENT_TYPES: readonly SeedDocType[] = [
  { code: 'philgeps_registration', name: 'PhilGEPS registration certificate', category: 'registration', hasExpiry: true, defaultValidityMonths: 12 },
  { code: 'dti_business_name', name: 'DTI business name registration', category: 'registration', hasExpiry: true, defaultValidityMonths: 60 },
  { code: 'sec_registration', name: 'SEC registration', category: 'registration', hasExpiry: false },
  { code: 'cda_registration', name: 'CDA registration', category: 'registration', hasExpiry: false },
  { code: 'mayors_permit', name: "Mayor's or business permit", category: 'license', hasExpiry: true, defaultValidityMonths: 12 },
  { code: 'pcab_license', name: "PCAB contractor's license", category: 'license', hasExpiry: true, defaultValidityMonths: 12 },
  { code: 'bir_registration', name: 'BIR certificate of registration', category: 'tax', hasExpiry: false },
  { code: 'tax_clearance', name: 'Tax clearance certificate', category: 'tax', hasExpiry: true },
  { code: 'income_tax_return', name: 'Income tax return with filing proof', category: 'tax', hasExpiry: false },
  { code: 'audited_financial_statements', name: 'Audited financial statements', category: 'financial', hasExpiry: false },
  { code: 'nfcc_computation', name: 'NFCC computation', category: 'financial', hasExpiry: false },
  { code: 'org_chart', name: 'Organizational chart', category: 'other', hasExpiry: false },
  { code: 'jv_agreement', name: 'Joint venture agreement', category: 'other', hasExpiry: false },
];

export interface SeedTemplate {
  code: string;
  name: string;
  mode: TemplateMode;
  description?: string;
  items: TemplateItem[];
}

const vault = (key: string, label: string, stage: TemplateItem['stage'], mandatory: boolean, codes: string[]): TemplateItem => ({
  key, label, stage, mandatory, fulfillment: 'vault', docTypeCodes: codes, minValidityDaysAtSubmission: 0,
});
const generated = (key: string, label: string, stage: TemplateItem['stage'], mandatory: boolean, generator: NonNullable<TemplateItem['generator']>): TemplateItem => ({
  key, label, stage, mandatory, fulfillment: 'generated', generator, minValidityDaysAtSubmission: 0,
});
const other = (key: string, label: string, stage: TemplateItem['stage'], mandatory: boolean, fulfillment: 'upload' | 'external', notes: string): TemplateItem => ({
  key, label, stage, mandatory, fulfillment, minValidityDaysAtSubmission: 0, notes,
});
const BUSINESS_REG = ['dti_business_name', 'sec_registration', 'cda_registration'];

export const SYSTEM_TEMPLATES: readonly SeedTemplate[] = [
  {
    code: 'public_infra_default',
    name: 'Public bidding: infrastructure (default)',
    mode: 'public_bidding',
    items: [
      vault('philgeps_registration', 'PhilGEPS registration certificate', 'eligibility', true, ['philgeps_registration']),
      vault('business_registration', 'Business registration (DTI, SEC or CDA)', 'eligibility', true, BUSINESS_REG),
      vault('mayors_permit', "Mayor's or business permit", 'eligibility', true, ['mayors_permit']),
      vault('pcab_license', "PCAB contractor's license", 'eligibility', true, ['pcab_license']),
      vault('tax_clearance', 'Tax clearance certificate', 'eligibility', true, ['tax_clearance']),
      vault('audited_fs', 'Audited financial statements', 'eligibility', true, ['audited_financial_statements']),
      vault('income_tax_return', 'Income tax return with filing proof', 'eligibility', true, ['income_tax_return']),
      generated('completed_contracts', 'Statement of completed contracts', 'eligibility', true, 'completed_projects'),
      generated('ongoing_contracts', 'Statement of ongoing contracts', 'eligibility', true, 'ongoing_projects'),
      generated('nfcc', 'NFCC computation', 'eligibility', true, 'nfcc'),
      other('bid_security', 'Bid security', 'eligibility', true, 'external', 'Scan of bid security or bid securing declaration'),
      other('omnibus_sworn_statement', 'Omnibus sworn statement', 'eligibility', true, 'external', 'Scan of the notarized statement'),
      vault('org_chart', 'Organizational chart', 'technical', false, ['org_chart']),
      generated('key_personnel', 'List of key personnel', 'technical', true, 'personnel_list'),
      generated('equipment', 'List of equipment', 'technical', true, 'equipment_list'),
      other('technical_proposal', 'Technical proposal', 'technical', true, 'upload', 'Proposal export or scan'),
      other('bid_form_boq', 'Bid form and priced bill of quantities', 'financial', true, 'upload', 'Bid form and priced BOQ'),
      other('cash_flow', 'Cash flow and payment schedule', 'financial', false, 'upload', 'Cash flow and payment schedule'),
    ],
  },
  {
    code: 'private_bid_basic',
    name: 'Private bid: basic',
    mode: 'private_bid',
    items: [
      vault('business_registration', 'Business registration (DTI, SEC or CDA)', 'eligibility', true, BUSINESS_REG),
      vault('mayors_permit', "Mayor's or business permit", 'eligibility', true, ['mayors_permit']),
      vault('pcab_license', "PCAB contractor's license", 'eligibility', false, ['pcab_license']),
      generated('completed_contracts', 'Statement of completed contracts', 'technical', true, 'completed_projects'),
      generated('key_personnel', 'List of key personnel', 'technical', true, 'personnel_list'),
      generated('equipment', 'List of equipment', 'technical', false, 'equipment_list'),
      other('technical_proposal', 'Technical proposal', 'technical', true, 'upload', 'Proposal export or scan'),
      other('bid_form_boq', 'Priced bill of quantities', 'financial', true, 'upload', 'Priced BOQ'),
      other('bid_bond', 'Bid bond', 'financial', false, 'external', 'Scan of bid bond'),
    ],
  },
  // Drafts added after v1 for the civil engineer to review before clients use them.
  {
    code: 'small_value_default',
    name: 'Small value procurement (draft for review)',
    mode: 'small_value',
    description: 'Pending civil engineer review. Negotiated procurement under the small value threshold.',
    items: [
      vault('philgeps_registration', 'PhilGEPS registration certificate', 'eligibility', true, ['philgeps_registration']),
      vault('mayors_permit', "Mayor's or business permit", 'eligibility', true, ['mayors_permit']),
      vault('business_registration', 'Business registration (DTI, SEC or CDA)', 'eligibility', false, BUSINESS_REG),
      vault('tax_clearance', 'Tax clearance certificate', 'eligibility', false, ['tax_clearance']),
      vault('income_tax_return', 'Income tax return with filing proof', 'eligibility', false, ['income_tax_return']),
      other('omnibus_sworn_statement', 'Omnibus sworn statement', 'eligibility', true, 'external', 'Scan of the notarized statement'),
      other('price_quotation', 'Price quotation form', 'financial', true, 'upload', "Signed quotation on the procuring entity's form"),
    ],
  },
  {
    code: 'design_build_default',
    name: 'Public bidding: design and build (draft for review)',
    mode: 'public_bidding',
    description: 'Pending civil engineer review. Adds design team and preliminary design to the infrastructure list.',
    items: [
      vault('philgeps_registration', 'PhilGEPS registration certificate', 'eligibility', true, ['philgeps_registration']),
      vault('business_registration', 'Business registration (DTI, SEC or CDA)', 'eligibility', true, BUSINESS_REG),
      vault('mayors_permit', "Mayor's or business permit", 'eligibility', true, ['mayors_permit']),
      vault('pcab_license', "PCAB contractor's license", 'eligibility', true, ['pcab_license']),
      vault('tax_clearance', 'Tax clearance certificate', 'eligibility', true, ['tax_clearance']),
      vault('audited_fs', 'Audited financial statements', 'eligibility', true, ['audited_financial_statements']),
      generated('completed_contracts', 'Statement of completed contracts', 'eligibility', true, 'completed_projects'),
      generated('ongoing_contracts', 'Statement of ongoing contracts', 'eligibility', true, 'ongoing_projects'),
      generated('nfcc', 'NFCC computation', 'eligibility', true, 'nfcc'),
      vault('jv_agreement', 'Joint venture agreement (if a JV)', 'eligibility', false, ['jv_agreement']),
      other('bid_security', 'Bid security', 'eligibility', true, 'external', 'Scan of bid security or bid securing declaration'),
      other('omnibus_sworn_statement', 'Omnibus sworn statement', 'eligibility', true, 'external', 'Scan of the notarized statement'),
      generated('key_personnel', 'Design and construction team', 'technical', true, 'personnel_list'),
      generated('equipment', 'List of equipment', 'technical', true, 'equipment_list'),
      other('preliminary_design', 'Preliminary design and design concept', 'technical', true, 'upload', 'Drawings and design report'),
      other('technical_proposal', 'Technical proposal and work plan', 'technical', true, 'upload', 'Proposal export or scan'),
      other('bid_form_boq', 'Bid form and cost estimate', 'financial', true, 'upload', 'Bid form and priced estimate'),
    ],
  },
  {
    code: 'consulting_default',
    name: 'Consulting services (draft for review)',
    mode: 'public_bidding',
    description: 'Pending civil engineer review. Eligibility and technical proposal for consulting engagements.',
    items: [
      vault('philgeps_registration', 'PhilGEPS registration certificate', 'eligibility', true, ['philgeps_registration']),
      vault('business_registration', 'Business registration (DTI, SEC or CDA)', 'eligibility', true, BUSINESS_REG),
      vault('mayors_permit', "Mayor's or business permit", 'eligibility', true, ['mayors_permit']),
      vault('tax_clearance', 'Tax clearance certificate', 'eligibility', true, ['tax_clearance']),
      generated('completed_contracts', 'Statement of completed engagements', 'eligibility', true, 'completed_projects'),
      generated('ongoing_contracts', 'Statement of ongoing engagements', 'eligibility', true, 'ongoing_projects'),
      other('omnibus_sworn_statement', 'Omnibus sworn statement', 'eligibility', true, 'external', 'Scan of the notarized statement'),
      generated('key_personnel', 'Key staff with CVs', 'technical', true, 'personnel_list'),
      other('approach_methodology', 'Approach, methodology and work plan', 'technical', true, 'upload', 'Proposal export or scan'),
      other('financial_proposal', 'Financial proposal', 'financial', true, 'upload', 'Sealed separately where required'),
    ],
  },
];
