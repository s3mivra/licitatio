import path from 'node:path';
import PdfPrinter from 'pdfmake';
import type { Content, TableCell as PdfCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { env } from '../../config/env';
import type { ResolvedNode, ResolvedProposal, ResolvedRun } from '../../domain/proposal/resolve';
import type { ImageMap } from '../render/types';

// Roboto TTFs live in apps/api/assets/fonts; the process runs from apps/api (Docker WORKDIR too).
const FONT_DIR = env.FONT_DIR ?? path.join(process.cwd(), 'assets', 'fonts');

let printer: PdfPrinter | null = null;
const getPrinter = (): PdfPrinter => {
  printer ??= new PdfPrinter({
    Roboto: {
      normal: path.join(FONT_DIR, 'Roboto-Regular.ttf'),
      bold: path.join(FONT_DIR, 'Roboto-Bold.ttf'),
      italics: path.join(FONT_DIR, 'Roboto-Italic.ttf'),
      bolditalics: path.join(FONT_DIR, 'Roboto-BoldItalic.ttf'),
    },
  });
  return printer;
};

const CONTENT_WIDTH_PT = 487;
const textRuns = (rs: ResolvedRun[]) => rs.map((r) => ({ text: r.text, bold: r.bold, italics: r.italic }));

function nodeToPdf(node: ResolvedNode, images: ImageMap): Content {
  switch (node.type) {
    case 'heading':
      return { text: textRuns(node.runs), style: `h${node.level}` };
    case 'paragraph':
      return { text: textRuns(node.runs), margin: [0, 0, 0, 6] };
    case 'list': {
      const items = node.items.map((i) => ({ text: textRuns(i) }));
      return node.ordered ? { ol: items, margin: [0, 0, 0, 6] } : { ul: items, margin: [0, 0, 0, 6] };
    }
    case 'table':
      return {
        table: {
          headerRows: 1,
          widths: node.header.map(() => '*'),
          body: [node.header.map((h): PdfCell => ({ text: h, bold: true, fillColor: '#eeeeee' })), ...node.rows.map((r) => r.map((c): PdfCell => ({ text: c })))],
        },
        layout: 'lightHorizontalLines',
        fontSize: 9,
        margin: [0, 0, 0, 8],
      };
    case 'image': {
      const img = images.get(node.fileId);
      if (!img) return { text: '[image unavailable]', italics: true };
      const picture: Content = {
        image: `data:${img.mime};base64,${Buffer.from(img.bytes).toString('base64')}`,
        width: (CONTENT_WIDTH_PT * node.widthPercent) / 100,
        alignment: 'center',
        margin: [0, 0, 0, 4],
      };
      return node.caption ? { stack: [picture, { text: node.caption, italics: true, fontSize: 9, alignment: 'center' }], margin: [0, 0, 0, 8] } : picture;
    }
    case 'pageBreak':
      return { text: '', pageBreak: 'after' };
  }
}

export function renderProposalPdf(doc: ResolvedProposal, images: ImageMap): Promise<Buffer> {
  const content: Content[] = [
    { text: doc.title, style: 'title' },
    { text: doc.bidder, bold: true },
    { text: doc.generatedOn, margin: [0, 0, 0, 14] },
  ];
  for (const section of doc.sections) {
    content.push({ text: section.title, style: 'h1' });
    for (const node of section.nodes) content.push(nodeToPdf(node, images));
  }
  const definition: TDocumentDefinitions = {
    info: { title: doc.title, author: doc.bidder },
    pageSize: 'A4',
    pageMargins: [54, 54, 54, 60],
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.25 },
    styles: {
      title: { fontSize: 20, bold: true, margin: [0, 0, 0, 8] },
      h1: { fontSize: 15, bold: true, margin: [0, 12, 0, 6] },
      h2: { fontSize: 12.5, bold: true, margin: [0, 10, 0, 4] },
      h3: { fontSize: 11, bold: true, margin: [0, 8, 0, 4] },
    },
    footer: (current: number, count: number) => ({ text: `${doc.bidder} | Page ${current} of ${count}`, alignment: 'center', fontSize: 8, margin: [0, 18, 0, 0] }),
    content,
  };
  return new Promise<Buffer>((resolve, reject) => {
    const pdf = getPrinter().createPdfKitDocument(definition);
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    pdf.end();
  });
}
