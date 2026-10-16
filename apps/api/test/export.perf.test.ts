import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildPacketPdf } from '../src/infra/pdf/buildPacketPdf';
import type { PacketPdfItem } from '../src/infra/pdf/buildPacketPdf';

/** Acceptance (M6): a 150-page export completes in under 60 seconds. Measured on the build itself, without storage. */
describe('packet export performance', () => {
  it('builds a 150-page packet well under 60 seconds', async () => {
    const items: PacketPdfItem[] = [];
    for (let i = 0; i < 30; i++) {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for (let p = 0; p < 5; p++) doc.addPage().drawText(`Document ${i + 1}, page ${p + 1}`, { x: 72, y: 700, size: 14, font });
      items.push({ stage: i < 15 ? 'Eligibility documents' : 'Technical documents', label: `Requirement ${i + 1}`, statusLabel: 'Complete', file: { bytes: await doc.save(), mime: 'application/pdf' } });
    }
    const started = performance.now();
    const result = await buildPacketPdf({ bidder: 'B', opportunityTitle: 'Perf', procuringEntity: 'P', submissionDate: '2026-11-10', generatedOn: '2026-10-16', items });
    const seconds = (performance.now() - started) / 1000;
    expect(result.pageCount).toBe(1 + 1 + 150);
    expect(seconds).toBeLessThan(60);
    console.info(`150-page packet built in ${seconds.toFixed(2)} s`);
  }, 90_000);
});
