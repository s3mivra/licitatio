import type { Express } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { authenticator } from 'otplib';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { addDays, manilaDateOf } from '@licitatio/shared';
import { DocumentTypeModel, FileModel, RequirementTemplateModel, UserModel } from '../src/models';
import { clearOrgAccessCache } from '../src/modules/auth/access';
import { hashPassword } from '../src/modules/auth/auth.service';
import { encryptSecret } from '../src/shared/crypto';
import { SYSTEM_DOCUMENT_TYPES, SYSTEM_TEMPLATES } from '../../../scripts/seedData';
import { mailControl, objects, sentMail, sentSms } from './state';

export interface Auth {
  token: string;
  orgId: string;
  userId: string;
  email: string;
}

export const PASSWORD = 'correct-horse-battery';

let replSet: MongoMemoryReplSet | undefined;

export async function startDb(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

export async function resetDb(): Promise<void> {
  const db = mongoose.connection.db;
  if (db) await Promise.all((await db.collections()).map((c) => c.deleteMany({})));
  await DocumentTypeModel.insertMany(SYSTEM_DOCUMENT_TYPES.map((t) => ({ ...t, orgId: null, archivedAt: null })));
  await RequirementTemplateModel.insertMany(SYSTEM_TEMPLATES.map((t) => ({ ...t, orgId: null, archivedAt: null })));
  sentMail.length = 0;
  sentSms.length = 0;
  objects.clear();
  mailControl.failFor.clear();
  clearOrgAccessCache();
}

export async function stopDb(): Promise<void> {
  await mongoose.disconnect();
  await replSet?.stop();
}

export const dayOffset = (days: number): string => addDays(manilaDateOf(new Date()), days);

export function api(app: Express, auth: Pick<Auth, 'token' | 'orgId'>) {
  const bind = (req: request.Test): request.Test => req.set('Authorization', `Bearer ${auth.token}`);
  const base = `/api/v1/orgs/${auth.orgId}`;
  return {
    get: (path: string) => bind(request(app).get(base + path)),
    post: (path: string, body: object = {}) => bind(request(app).post(base + path).send(body)),
    patch: (path: string, body: object) => bind(request(app).patch(base + path).send(body)),
    del: (path: string) => bind(request(app).delete(base + path)),
  };
}

export const lastTokenFor = (email: string, path: string): string => {
  const mail = [...sentMail].reverse().find((m) => m.to === email && m.text.includes(`${path}?token=`));
  const token = new RegExp(`${path.replace(/\//g, '\\/')}\\?token=([A-Za-z0-9_-]+)`).exec(mail?.text ?? '')?.[1];
  if (!token) throw new Error(`${path} token not found in sent mail for ${email}`);
  return token;
};

export function login(app: Express, email: string, password = PASSWORD, totp?: string): request.Test {
  return request(app).post('/api/v1/auth/login').send({ email, password, ...(totp ? { totp } : {}) });
}

export async function registerAndLogin(app: Express, email: string): Promise<Auth> {
  await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Test User', email, password: PASSWORD, orgName: `Org ${email}`, orgType: 'contractor' })
    .expect(202);
  await request(app).post('/api/v1/auth/verify-email').send({ token: lastTokenFor(email, '/verify-email') }).expect(204);
  const res = await login(app, email).expect(200);
  return { token: res.body.accessToken, orgId: res.body.memberships[0].orgId, userId: res.body.user.id, email };
}

/** Invites email into owner's org with role, accepts, and returns a session scoped to that org. */
export async function addMember(app: Express, owner: Auth, email: string, role: 'admin' | 'editor' | 'viewer'): Promise<Auth> {
  await api(app, owner).post('/members/invite', { email, role }).expect(201);
  const res = await request(app)
    .post('/api/v1/auth/accept-invite')
    .send({ token: lastTokenFor(email, '/accept-invite'), name: `${role} user`, password: PASSWORD })
    .expect(200);
  return { token: res.body.accessToken, orgId: owner.orgId, userId: res.body.user.id, email };
}

export async function createStaffUser(email: string, platformRole: 'staff' | 'admin' = 'staff'): Promise<{ secret: string; userId: string }> {
  const secret = authenticator.generateSecret();
  const user = await UserModel.create({
    email, name: 'Desk Staff', passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date(), platformRole,
    totp: { secretEnc: encryptSecret(secret), enabledAt: new Date() },
  });
  return { secret, userId: String(user._id) };
}

export async function loginStaff(app: Express, email: string, secret: string): Promise<string> {
  const res = await login(app, email, PASSWORD, authenticator.generate(secret)).expect(200);
  return res.body.accessToken as string;
}

export async function onePagePdf(pages = 1): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage();
  return pdf.save();
}

/** Runs the real presign and finalize endpoints, writing the bytes into the fake bucket in between. */
export async function uploadFile(app: Express, auth: Pick<Auth, 'token' | 'orgId'>, bytes: Uint8Array, mime = 'application/pdf'): Promise<string> {
  const client = api(app, auth);
  const presign = await client.post('/files/presign', { filename: 'doc.pdf', mime, size: bytes.byteLength }).expect(201);
  const file = await FileModel.findById(presign.body.data.fileId).lean();
  if (!file) throw new Error('file row missing');
  objects.set(file.key, { bytes, contentType: mime });
  await client.post(`/files/${presign.body.data.fileId}/finalize`).expect(200);
  return presign.body.data.fileId as string;
}
