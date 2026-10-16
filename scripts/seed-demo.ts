import { randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { addDays, manilaDateOf } from '@licitatio/shared';
import { putObjectBytes } from '../apps/api/src/infra/r2';
import {
  EquipmentModel, ExperienceProjectModel, FileModel, MembershipModel, OpportunityModel, OrganizationModel, PersonnelModel, UserModel,
  VaultDocumentModel,
} from '../apps/api/src/models';
import { hashPassword } from '../apps/api/src/modules/auth/auth.service';
import { runScript } from './db';

/**
 * Local development only: a verified demo owner with a filled-in company and sample data.
 * Idempotent: does nothing when the demo user already exists. Never run against production.
 *
 *   Demo login: demo@licitatio.test / demo-password-123
 */
const EMAIL = 'demo@licitatio.test';
const PASSWORD = 'demo-password-123';

if (process.env.NODE_ENV === 'production') throw new Error('seed-demo is for local development only');

async function samplePdf(title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  page.drawText(title, { x: 72, y: 700, size: 20, font: await pdf.embedFont(StandardFonts.Helvetica) });
  page.drawText('Sample document for the Licitatio demo.', { x: 72, y: 670, size: 12 });
  return pdf.save();
}

await runScript('seed-demo', async () => {
  if (await UserModel.exists({ email: EMAIL })) {
    console.log(`Demo account already exists: ${EMAIL}`);
    return;
  }
  const today = manilaDateOf(new Date());
  const user = await UserModel.create({ email: EMAIL, name: 'Demo Owner', passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() });
  const org = await OrganizationModel.create({
    name: 'Bayanihan Builders Corp.', slug: `bayanihan-builders-${randomUUID().slice(0, 4)}`, type: 'contractor', plan: 'desk', planExpiresAt: null,
    profile: {
      legalName: 'Bayanihan Builders Corporation',
      address: { line1: '88 Ortigas Ave.', city: 'Pasig City', province: 'Metro Manila', postalCode: '1600' },
      phone: '+63 2 8123 4567', email: 'bids@bayanihan.test', yearEstablished: 2009,
      registrations: { philgepsNo: 'PG-2009-11223', pcabLicenseNo: '41234', pcabCategory: 'AA', pcabClassifications: ['General Building', 'General Engineering'] },
      signatory: { name: 'Ramon Santos', position: 'President' },
      narrative: { about: 'General contractor for schools, roads and drainage in Luzon since 2009.' },
    },
  });
  await MembershipModel.create({ orgId: org._id, userId: user._id, role: 'owner' });

  const docs: Array<[string, string, string | null, string]> = [
    ['mayors_permit', "Mayor's permit 2026", addDays(today, -5), 'MP-2026-0456'],
    ['tax_clearance', 'Tax clearance', addDays(today, 20), 'TC-88231'],
    ['pcab_license', 'PCAB license', addDays(today, 200), '41234'],
    ['philgeps_registration', 'PhilGEPS platinum certificate', addDays(today, 45), 'PG-2009-11223'],
    ['sec_registration', 'SEC certificate of incorporation', null, 'CS200912345'],
  ];
  let bytesUsed = 0;
  for (const [code, title, expiresAt, ref] of docs) {
    const bytes = await samplePdf(title);
    const key = `orgs/${String(org._id)}/${new Date().getUTCFullYear()}/${randomUUID()}`;
    await putObjectBytes(key, bytes, 'application/pdf');
    const file = await FileModel.create({ orgId: org._id, key, originalName: `${title}.pdf`, mime: 'application/pdf', size: bytes.byteLength, status: 'ready', uploadedBy: user._id, pageCount: 1 });
    bytesUsed += bytes.byteLength;
    const version = { versionNo: 1, fileId: file._id, issuedAt: addDays(today, -300), expiresAt, uploadedBy: user._id, uploadedAt: new Date() };
    await VaultDocumentModel.create({ orgId: org._id, docTypeCode: code, title, referenceNumber: ref, current: version, versions: [version], createdBy: user._id });
  }
  await OrganizationModel.updateOne({ _id: org._id }, { $set: { storageBytesUsed: bytesUsed } });

  await ExperienceProjectModel.create([
    { orgId: org._id, name: 'Rehabilitation of Pasig Elementary School', clientName: 'DepEd NCR', clientType: 'government', location: 'Pasig City', category: 'Buildings', role: 'main', contractAmount: 1_850_000_000, startDate: '2024-02-01', completionDate: '2024-11-30', status: 'completed' },
    { orgId: org._id, name: 'Drainage improvement, Brgy. San Jose', clientName: 'LGU Antipolo', clientType: 'government', location: 'Antipolo, Rizal', category: 'Flood control and drainage', role: 'main', contractAmount: 950_000_000, startDate: '2026-03-01', status: 'ongoing' },
  ]);
  await PersonnelModel.create([
    { orgId: org._id, fullName: 'Engr. Liza Mercado', position: 'Project Manager', profession: 'Civil Engineer', licenseNo: 'PRC-0098765', licenseExpiresAt: addDays(today, 25), yearsExperience: 14, isKeyPersonnel: true },
    { orgId: org._id, fullName: 'Engr. Paolo Diaz', position: 'Site Engineer', profession: 'Civil Engineer', licenseNo: 'PRC-0123456', licenseExpiresAt: addDays(today, 400), yearsExperience: 6, isKeyPersonnel: true },
    { orgId: org._id, fullName: 'Mario Cruz', position: 'Foreman', yearsExperience: 20, isKeyPersonnel: false },
  ]);
  await EquipmentModel.create([
    { orgId: org._id, name: 'Backhoe', type: 'Excavator', make: 'Komatsu', model: 'PC200', quantity: 2, ownership: 'owned', condition: 'good' },
    { orgId: org._id, name: 'Dump truck', type: 'Truck', make: 'Isuzu', model: 'Giga', quantity: 3, ownership: 'owned', condition: 'fair' },
    { orgId: org._id, name: 'Concrete mixer', type: 'Mixer', quantity: 1, ownership: 'leased', condition: 'good' },
  ]);
  const at = (days: number) => new Date(`${addDays(today, days)}T10:00:00+08:00`);
  const history = (to: string) => [{ from: null, to: 'identified', by: user._id, at: new Date() }, ...(to === 'identified' ? [] : [{ from: 'identified', to, by: user._id, at: new Date() }])];
  await OpportunityModel.create([
    { orgId: org._id, title: 'Construction of a 2-storey, 4-classroom school building', procuringEntity: 'DPWH Rizal 1st DEO', source: 'philgeps', referenceNo: '26DA0123', approvedBudget: 2_450_000_000, submissionDeadlineAt: at(3), openingAt: at(3), status: 'evaluating', statusHistory: history('evaluating'), assigneeId: user._id },
    { orgId: org._id, title: 'Concreting of farm-to-market road, Brgy. Mabini', procuringEntity: 'Province of Laguna', source: 'philgeps', approvedBudget: 1_200_000_000, submissionDeadlineAt: at(12), status: 'identified', statusHistory: history('identified') },
    { orgId: org._id, title: 'Warehouse extension', procuringEntity: 'Acme Logistics Inc.', source: 'private', submissionDeadlineAt: at(6), status: 'identified', statusHistory: history('identified') },
  ]);
  console.log(`Demo account ready: ${EMAIL} (password in scripts/seed-demo.ts)`);
});
