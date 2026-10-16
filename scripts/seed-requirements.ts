import { templateBody } from '@licitatio/shared';
import { DocumentTypeModel, RequirementTemplateModel } from '../apps/api/src/models';
import { runScript } from './db';
import { SYSTEM_DOCUMENT_TYPES, SYSTEM_TEMPLATES } from './seedData';

/**
 * Upserts system document types and requirement templates, idempotent by code.
 * System templates are never edited in place once packets use them: ship a change as a new
 * code suffix (_v2) so existing packets keep their snapshot.
 */
await runScript('seed-requirements', async () => {
  for (const t of SYSTEM_DOCUMENT_TYPES) {
    await DocumentTypeModel.updateOne(
      { orgId: null, code: t.code },
      { $set: { ...t, archivedAt: null }, $setOnInsert: { orgId: null, rev: 0 } },
      { upsert: true, runValidators: true },
    );
  }
  for (const t of SYSTEM_TEMPLATES) {
    templateBody.parse(t); // the same validation tenants get
    const unknown = t.items.flatMap((i) => i.docTypeCodes ?? []).filter((c) => !SYSTEM_DOCUMENT_TYPES.some((d) => d.code === c));
    if (unknown.length > 0) throw new Error(`Template ${t.code} references unknown document types: ${unknown.join(', ')}`);
    await RequirementTemplateModel.updateOne(
      { orgId: null, code: t.code },
      { $set: { ...t, archivedAt: null }, $setOnInsert: { orgId: null, rev: 0 } },
      { upsert: true, runValidators: true },
    );
  }
  console.log(`Seeded ${SYSTEM_DOCUMENT_TYPES.length} document types and ${SYSTEM_TEMPLATES.length} templates.`);
});
