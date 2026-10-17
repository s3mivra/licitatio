import type { Model } from 'mongoose';
import type { Equipment, ExperienceProject, Personnel } from '@licitatio/shared';
import { EquipmentModel, ExperienceProjectModel, PersonnelModel } from '../models';
import { OrgRepo } from '../shared/orgRepo';

export type RegisterKind = 'project' | 'personnel' | 'equipment';
export type RegisterDoc = ExperienceProject | Personnel | Equipment;

const MODELS: Record<RegisterKind, Model<RegisterDoc>> = {
  project: ExperienceProjectModel as unknown as Model<RegisterDoc>,
  personnel: PersonnelModel as unknown as Model<RegisterDoc>,
  equipment: EquipmentModel as unknown as Model<RegisterDoc>,
};

/** One tenant-scoped repository shape for the three registers. */
export class RegisterRepo extends OrgRepo<RegisterDoc> {
  constructor(kind: RegisterKind, orgId: string) {
    super(MODELS[kind], orgId);
  }

  async page(filter: Record<string, unknown>, sort: Record<string, 1 | -1>, page: number, pageSize: number): Promise<{ rows: RegisterDoc[]; total: number }> {
    const scoped = this.scope(filter);
    const [rows, total] = await Promise.all([
      this.model.find(scoped).sort({ ...sort, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean<RegisterDoc[]>(),
      this.model.countDocuments(scoped),
    ]);
    return { rows, total };
  }

  async getLean(id: string): Promise<RegisterDoc> {
    return (await this.getById(id)).toObject() as RegisterDoc;
  }

  async insert(data: Record<string, unknown>): Promise<RegisterDoc> {
    return (await this.create(data as Omit<RegisterDoc, 'orgId' | '_id'>)).toObject() as RegisterDoc;
  }

  async insertMany(rows: Array<Record<string, unknown>>): Promise<number> {
    const docs = await this.model.insertMany(rows.map((r) => ({ ...r, orgId: this.orgOid })));
    return docs.length;
  }

  /** PATCH on registers replaces the record: optional fields left out are removed. */
  async replace(id: string, data: Record<string, unknown>, optionalKeys: readonly string[]): Promise<RegisterDoc> {
    const unset = Object.fromEntries(optionalKeys.filter((k) => data[k] === undefined).map((k) => [k, 1]));
    const set = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const doc = await this.updateById(id, { $set: set, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) });
    return doc.toObject() as RegisterDoc;
  }
}
