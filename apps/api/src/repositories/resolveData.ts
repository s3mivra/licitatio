import type { Equipment, ExperienceProject, FileObject, Opportunity, Organization, Personnel } from '@licitatio/shared';
import { manilaDateOf } from '@licitatio/shared';
import type { ResolveData } from '../domain/proposal/resolve';
import { EquipmentModel, ExperienceProjectModel, FileModel, OpportunityModel, OrganizationModel, PersonnelModel } from '../models';
import { AppError } from '../shared/errors';
import { toOid } from '../shared/orgRepo';

/** Everything the resolver and schedule generators read, in one place. */
export async function loadResolveData(orgId: string, opportunityId: string | null | undefined): Promise<ResolveData> {
  const oid = toOid(orgId);
  const [org, opportunity, projects, personnel, equipment] = await Promise.all([
    OrganizationModel.findById(oid).lean<Organization>(),
    opportunityId ? OpportunityModel.findOne({ _id: toOid(opportunityId), orgId: oid }).lean<Opportunity>() : Promise.resolve(null),
    ExperienceProjectModel.find({ orgId: oid }).lean<ExperienceProject[]>(),
    PersonnelModel.find({ orgId: oid }).lean<Personnel[]>(),
    EquipmentModel.find({ orgId: oid }).lean<Equipment[]>(),
  ]);
  if (!org) throw new AppError(404, 'not_found', 'Resource not found');
  return { org, opportunity, projects, personnel, equipment, today: manilaDateOf(new Date()) };
}

/** Ready image files of this organization, for proposal image nodes. */
export async function readyImages(orgId: string, ids: readonly string[]): Promise<FileObject[]> {
  const valid = ids.filter((i) => /^[a-f0-9]{24}$/.test(i));
  if (valid.length === 0) return [];
  return FileModel.find({ _id: { $in: valid.map((i) => toOid(i)) }, orgId: toOid(orgId), status: 'ready', mime: { $in: ['image/png', 'image/jpeg'] } }).lean<FileObject[]>();
}
