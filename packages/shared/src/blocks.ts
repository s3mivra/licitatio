import { z } from 'zod';

const run = z.object({
  text: z.string().max(5000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
}).strict();
const runs = z.array(run).max(100);

const headingNode = z.object({ type: z.literal('heading'), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), runs }).strict();
const paragraphNode = z.object({ type: z.literal('paragraph'), runs }).strict();
const listNode = z.object({ type: z.literal('list'), ordered: z.boolean(), items: z.array(runs).min(1).max(100) }).strict();
const tableNode = z.object({
  type: z.literal('table'),
  header: z.array(z.string().max(120)).min(1).max(8),
  rows: z.array(z.array(z.string().max(1000)).max(8)).max(100),
}).strict();
const dataTableNode = z.object({
  type: z.literal('dataTable'),
  source: z.enum(['projects', 'personnel', 'equipment']),
  limit: z.number().int().min(1).max(50),
  filter: z.enum(['all', 'completed', 'ongoing', 'key']).optional(), // completed and ongoing for projects, key for personnel
}).strict();
const imageNode = z.object({
  type: z.literal('image'),
  fileId: z.string().regex(/^[a-f0-9]{24}$/),
  widthPercent: z.number().int().min(10).max(100),
  caption: z.string().max(300).optional(),
}).strict();
const pageBreakNode = z.object({ type: z.literal('pageBreak') }).strict();

export const blockNodeSchema = z.discriminatedUnion('type', [
  headingNode, paragraphNode, listNode, tableNode, dataTableNode, imageNode, pageBreakNode,
]);

export const blockNodesSchema = z.array(blockNodeSchema).max(200).superRefine((nodes, ctx) => {
  nodes.forEach((n, i) => {
    if (n.type === 'table' && n.rows.some((r) => r.length !== n.header.length)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'rows'], message: 'Every row must match the header column count' });
    }
  });
});

export const proposalSectionsSchema = z.array(
  z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200), nodes: blockNodesSchema }).strict(),
).max(40);

export type BlockNode = z.infer<typeof blockNodeSchema>;
export type BlockRun = z.infer<typeof run>;

/** Variables the resolver knows. The registry is fixed in code. */
export const VARIABLES: ReadonlyArray<{ name: string; label: string }> = [
  { name: 'org.legalName', label: 'Legal name' },
  { name: 'org.tradeName', label: 'Trade name' },
  { name: 'org.address', label: 'Address' },
  { name: 'org.phone', label: 'Phone' },
  { name: 'org.email', label: 'Email' },
  { name: 'org.website', label: 'Website' },
  { name: 'org.yearEstablished', label: 'Year established' },
  { name: 'org.yearsInBusiness', label: 'Years in business' },
  { name: 'org.pcabLicenseNo', label: 'PCAB license no.' },
  { name: 'org.pcabCategory', label: 'PCAB category' },
  { name: 'org.tin', label: 'TIN' },
  { name: 'org.philgepsNo', label: 'PhilGEPS no.' },
  { name: 'signatory.name', label: 'Signatory name' },
  { name: 'signatory.position', label: 'Signatory position' },
  { name: 'opp.title', label: 'Bid title' },
  { name: 'opp.referenceNo', label: 'Bid reference no.' },
  { name: 'opp.procuringEntity', label: 'Procuring entity' },
  { name: 'opp.location', label: 'Bid location' },
  { name: 'opp.approvedBudget', label: 'Approved budget' },
  { name: 'opp.submissionDate', label: 'Submission date' },
  { name: 'opp.submissionDeadline', label: 'Submission deadline' },
  { name: 'stats.completedProjectCount', label: 'Completed project count' },
  { name: 'stats.completedProjectValue', label: 'Completed project value' },
  { name: 'date.today', label: "Today's date" },
];
