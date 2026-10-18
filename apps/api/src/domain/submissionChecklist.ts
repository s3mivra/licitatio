import type { BidPacket, Opportunity, PacketStage } from '@licitatio/shared';
import { manilaDateOf } from '@licitatio/shared';
import type { ResolvedNode, ResolvedProposal } from './proposal/resolve';

const STAGE_TITLE: Record<PacketStage, string> = {
  eligibility: 'Eligibility documents', technical: 'Technical documents', financial: 'Financial documents',
  post_qualification: 'Post-qualification documents', other: 'Other documents',
};
const COPY_LABEL = { original: 'Original', certified_copy: 'Certified true copy', photocopy: 'Photocopy' } as const;

/** Two-envelope submission: eligibility and technical in the first, financial in the second. */
export const envelopeOf = (stage: PacketStage): 1 | 2 | null => (stage === 'financial' ? 2 : stage === 'post_qualification' ? null : 1);

const para = (text: string, bold = false): ResolvedNode => ({ type: 'paragraph', runs: [{ text, bold }] });
const manilaDateTime = (d?: Date): string => {
  if (!d) return 'the date and time set in the bid documents';
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'long', timeStyle: 'short' }).format(new Date(d));
};

export interface ChecklistInput {
  bidder: string;
  opportunity: Pick<Opportunity, 'title' | 'procuringEntity' | 'referenceNo' | 'openingAt' | 'submissionDeadlineAt'>;
  packet: Pick<BidPacket, 'items'>;
  now: Date;
}

/** Printable envelope labels and a packing checklist. Not a prescribed form; bid documents may set their own marking rules. */
export function buildSubmissionChecklist(input: ChecklistInput): ResolvedProposal {
  const { bidder, opportunity: o, packet } = input;
  const items = [...packet.items].filter((i) => i.manual.state !== 'waived').sort((a, b) => a.order - b.order);
  const label = (n: 1 | 2, contents: string): ResolvedNode[] => [
    { type: 'heading', level: 2, runs: [{ text: n === 1 ? 'FIRST ENVELOPE' : 'SECOND ENVELOPE' }] },
    { type: 'table', header: ['', ''], rows: [
      ['Contents', contents],
      ['Name of contract', o.title],
      ['Reference no.', o.referenceNo ?? ''],
      ['Procuring entity', o.procuringEntity],
      ['Bidder', bidder],
      ['Do not open before', manilaDateTime(o.openingAt)],
    ] },
    para(''),
  ];
  const labels: ResolvedNode[] = [
    para('Print this page and attach each label to its sealed envelope. Follow any marking rules in the bid documents, which take precedence.'),
    ...label(1, 'Eligibility and technical documents'),
    ...(items.some((i) => envelopeOf(i.stage) === 2) ? label(2, 'Financial proposal') : []),
  ];

  const packed = items.filter((i) => i.submission?.packedAt).length;
  const checklist: ResolvedNode[] = [
    para(`Submission deadline: ${manilaDateTime(o.submissionDeadlineAt)}. ${packed} of ${items.length} items packed when printed.`),
  ];
  for (const stage of ['eligibility', 'technical', 'financial', 'post_qualification', 'other'] as const) {
    const rows = items.filter((i) => i.stage === stage);
    if (rows.length === 0) continue;
    const env = envelopeOf(stage);
    checklist.push({ type: 'heading', level: 3, runs: [{ text: `${STAGE_TITLE[stage]}${env ? ` (envelope ${env})` : ' (submit when requested)'}` }] });
    checklist.push({ type: 'table', header: ['#', 'Document', 'Copy', 'Notarized', 'Packed'], rows: rows.map((i, idx) => [
      String(idx + 1), `${i.label}${i.mandatory ? '' : ' (optional)'}`,
      i.submission?.copy ? COPY_LABEL[i.submission.copy] : 'Not set',
      i.submission?.notarized ? 'Yes' : '',
      i.submission?.packedAt ? '[x]' : '[ ]',
    ]) });
  }
  checklist.push(para(''), para('Checked by: ______________________________    Date: ______________'));

  return {
    title: 'Submission checklist and envelope labels',
    bidder,
    generatedOn: manilaDateOf(input.now),
    sections: [
      { title: 'Envelope labels', nodes: labels },
      { title: 'Packing checklist', nodes: checklist },
    ],
  };
}
