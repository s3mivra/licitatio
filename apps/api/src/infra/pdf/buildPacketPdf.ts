import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';

/** Permanent export failure: the export is marked failed and the job finishes without retry. */
export class ExportError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

export interface PacketPdfItem {
  stage: string; // display name of the stage
  label: string;
  statusLabel: string; // for example Complete, Waived, Missing
  file: { bytes: Uint8Array; mime: string } | null;
}

export interface PacketPdfInput {
  bidder: string;
  opportunityTitle: string;
  referenceNo?: string;
  procuringEntity: string;
  submissionDate: string;
  generatedOn: string;
  draftNote?: string;
  approvalNote?: string;
  items: PacketPdfItem[];
}

export interface PacketPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  warnings: string[];
  /** Index page range per item, by position in input.items. Exposed for tests. */
  pageRanges: Array<string | null>;
}

const PAGE: [number, number] = [595.28, 841.89];
const MARGIN = 54;
const ROWS_PER_INDEX_PAGE = 34;
export const MAX_TOTAL_PAGES = 400;

type Prepared = { kind: 'none'; note: string } | { kind: 'pdf'; doc: PDFDocument; pages: number } | { kind: 'image'; bytes: Uint8Array; mime: string };

interface IndexRow {
  kind: 'stage' | 'item';
  label: string;
  status: string;
  itemIndex: number;
}

/** Standard fonts encode WinAnsi only. */
function safe(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function fit(font: PDFFont, text: string, size: number, maxWidth: number): string {
  let out = safe(text);
  if (font.widthOfTextAtSize(out, size) <= maxWidth) return out;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) out = out.slice(0, -1);
  return `${out}...`;
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of safe(text).split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function prepare(item: PacketPdfItem, warnings: string[]): Promise<Prepared> {
  if (!item.file) return { kind: 'none', note: 'Not attached' };
  const { bytes, mime } = item.file;
  try {
    if (mime === 'application/pdf') {
      const doc = await PDFDocument.load(bytes);
      return { kind: 'pdf', doc, pages: doc.getPageCount() };
    }
    if (mime === 'image/png' || mime === 'image/jpeg') {
      const probe = await PDFDocument.create();
      if (mime === 'image/png') await probe.embedPng(bytes);
      else await probe.embedJpg(bytes);
      return { kind: 'image', bytes, mime };
    }
  } catch {
    warnings.push(`unreadable_file: ${item.label}`);
    return { kind: 'none', note: 'Unreadable file' };
  }
  warnings.push(`not_merged: ${item.label} (convert to PDF)`);
  return { kind: 'none', note: 'Not merged (convert to PDF)' };
}

async function addImagePage(out: PDFDocument, bytes: Uint8Array, mime: string): Promise<void> {
  const image = mime === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
  const page = out.addPage(PAGE);
  const maxW = PAGE[0] - MARGIN * 2;
  const maxH = PAGE[1] - MARGIN * 2;
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: (PAGE[0] - width) / 2, y: (PAGE[1] - height) / 2, width, height });
}

/** Cover, index with page ranges computed before writing, then the item files; a footer on every page. */
export async function buildPacketPdf(input: PacketPdfInput): Promise<PacketPdfResult> {
  const warnings: string[] = [];
  const prepared: Prepared[] = [];
  for (const item of input.items) prepared.push(await prepare(item, warnings)); // sequential to bound memory
  const pagesOf = (p: Prepared): number => (p.kind === 'pdf' ? p.pages : p.kind === 'image' ? 1 : 0);

  const rows: IndexRow[] = [];
  let lastStage = '';
  input.items.forEach((item, itemIndex) => {
    if (item.stage !== lastStage) {
      rows.push({ kind: 'stage', label: item.stage, status: '', itemIndex });
      lastStage = item.stage;
    }
    const p = prepared[itemIndex];
    rows.push({ kind: 'item', label: item.label, status: p && p.kind === 'none' ? p.note : item.statusLabel, itemIndex });
  });
  const indexPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_INDEX_PAGE));
  const contentPages = prepared.reduce((sum, p) => sum + pagesOf(p), 0);
  const total = 1 + indexPages + contentPages;
  if (total > MAX_TOTAL_PAGES) throw new ExportError('export_too_large', `Packet has ${total} pages, the limit is ${MAX_TOTAL_PAGES}`);

  const pageRanges: Array<string | null> = [];
  let cursor = 1 + indexPages + 1;
  prepared.forEach((p) => {
    const n = pagesOf(p);
    if (n > 0) {
      pageRanges.push(n === 1 ? String(cursor) : `${cursor}-${cursor + n - 1}`);
      cursor += n;
    } else {
      pageRanges.push(null);
    }
  });

  const out = await PDFDocument.create();
  out.setTitle(`${input.opportunityTitle} - bid packet`);
  out.setAuthor(input.bidder);
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const textWidth = PAGE[0] - MARGIN * 2;

  // cover
  const cover = out.addPage(PAGE);
  let y = PAGE[1] - 170;
  const put = (text: string, size: number, f: PDFFont, color = rgb(0, 0, 0), gap = 8): void => {
    for (const line of wrap(f, text, size, textWidth)) {
      cover.drawText(line, { x: MARGIN, y, size, font: f, color });
      y -= size + 4;
    }
    y -= gap;
  };
  put('BID SUBMISSION', 11, bold, rgb(0.4, 0.4, 0.4), 12);
  put(input.opportunityTitle, 20, bold, rgb(0, 0, 0), 18);
  if (input.referenceNo) put(`Reference no.: ${input.referenceNo}`, 12, font);
  put(`Procuring entity: ${input.procuringEntity}`, 12, font);
  put(`Bidder: ${input.bidder}`, 12, font);
  put(`Submission date: ${input.submissionDate}`, 12, font);
  put(`Prepared on: ${input.generatedOn}`, 12, font, rgb(0.4, 0.4, 0.4), 18);
  if (input.draftNote) put(input.draftNote, 13, bold, rgb(0.75, 0.1, 0.1));
  if (input.approvalNote) put(input.approvalNote, 11, font, rgb(0.1, 0.45, 0.25));

  // index
  for (let pageNo = 0; pageNo < indexPages; pageNo++) {
    const page = out.addPage(PAGE);
    let iy = PAGE[1] - MARGIN;
    page.drawText(pageNo === 0 ? 'Index' : 'Index (continued)', { x: MARGIN, y: iy, size: 14, font: bold });
    iy -= 30;
    page.drawText('Item', { x: MARGIN, y: iy, size: 9, font: bold });
    page.drawText('Status', { x: 350, y: iy, size: 9, font: bold });
    page.drawText('Pages', { x: 480, y: iy, size: 9, font: bold });
    iy -= 18;
    for (const row of rows.slice(pageNo * ROWS_PER_INDEX_PAGE, (pageNo + 1) * ROWS_PER_INDEX_PAGE)) {
      if (row.kind === 'stage') {
        page.drawText(fit(bold, row.label.toUpperCase(), 9, 400), { x: MARGIN, y: iy, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
      } else {
        page.drawText(fit(font, row.label, 10, 285), { x: MARGIN + 8, y: iy, size: 10, font });
        page.drawText(fit(font, row.status, 9, 120), { x: 350, y: iy, size: 9, font });
        page.drawText(pageRanges[row.itemIndex] ?? '-', { x: 480, y: iy, size: 10, font });
      }
      iy -= 18;
    }
  }

  // content
  for (const p of prepared) {
    if (p.kind === 'pdf') {
      const copied = await out.copyPages(p.doc, p.doc.getPageIndices());
      copied.forEach((page) => out.addPage(page));
    } else if (p.kind === 'image') {
      await addImagePage(out, p.bytes, p.mime);
    }
  }
  if (out.getPageCount() !== total) throw new ExportError('page_count_mismatch', `Expected ${total} pages, built ${out.getPageCount()}`);

  // footer on every page
  const label = input.referenceNo ?? input.opportunityTitle;
  out.getPages().forEach((page, i) => {
    const { width } = page.getSize();
    const footer = fit(font, `${input.bidder} | ${label} | Page ${i + 1} of ${total}`, 8, width - MARGIN * 2);
    page.drawText(footer, { x: MARGIN, y: 18, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
  });
  return { bytes: await out.save(), pageCount: total, warnings, pageRanges };
}
