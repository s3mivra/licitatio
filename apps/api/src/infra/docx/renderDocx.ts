import {
  AlignmentType, Document, Footer, HeadingLevel, ImageRun, Packer, PageBreak, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import type { ResolvedNode, ResolvedProposal, ResolvedRun } from '../../domain/proposal/resolve';
import type { ImageMap } from '../render/types';

const HEADINGS = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 } as const;
const CONTENT_WIDTH_PX = 600;

const runs = (rs: ResolvedRun[]): TextRun[] => rs.map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic }));
const cell = (text: string, bold = false): TableCell => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold, size: 20 })] })] });

function nodeToDocx(node: ResolvedNode, images: ImageMap): Array<Paragraph | Table> {
  switch (node.type) {
    case 'heading':
      return [new Paragraph({ heading: HEADINGS[node.level], children: runs(node.runs) })];
    case 'paragraph':
      return [new Paragraph({ spacing: { after: 120 }, children: runs(node.runs) })];
    case 'list':
      return node.items.map((item, i) =>
        node.ordered
          ? new Paragraph({ indent: { left: 360, hanging: 360 }, children: [new TextRun(`${i + 1}.\t`), ...runs(item)] })
          : new Paragraph({ bullet: { level: 0 }, children: runs(item) }),
      );
    case 'table':
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: node.header.map((h) => cell(h, true)) }),
            ...node.rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })),
          ],
        }),
        new Paragraph({ text: '' }),
      ];
    case 'image': {
      const img = images.get(node.fileId);
      if (!img) return [new Paragraph({ children: [new TextRun({ text: '[image unavailable]', italics: true })] })];
      const width = Math.round((CONTENT_WIDTH_PX * node.widthPercent) / 100);
      const height = Math.round((width * img.height) / img.width);
      const out: Paragraph[] = [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: img.format, data: Buffer.from(img.bytes), transformation: { width, height } })] }),
      ];
      if (node.caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: node.caption, italics: true, size: 18 })] }));
      return out;
    }
    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })];
  }
}

export function renderProposalDocx(doc: ResolvedProposal, images: ImageMap): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(doc.title)] }),
    new Paragraph({ children: [new TextRun({ text: doc.bidder, bold: true })] }),
    new Paragraph({ spacing: { after: 240 }, children: [new TextRun(doc.generatedOn)] }),
  ];
  for (const section of doc.sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(section.title)] }));
    for (const node of section.nodes) children.push(...nodeToDocx(node, images));
  }
  const document = new Document({
    creator: doc.bidder,
    title: doc.title,
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ size: 16, children: [`${doc.bidder} | Page `, PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] })] })],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}
