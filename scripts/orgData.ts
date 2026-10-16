import type { Model } from 'mongoose';
import {
  AuditLogModel, AuthTokenModel, BidPacketModel, ContentBlockModel, DocumentTypeModel, EquipmentModel, ExperienceProjectModel, ExportModel, FileModel,
  IdempotencyModel, MembershipModel, NotificationModel, OpportunityModel, PersonnelModel, ProposalModel, RequirementTemplateModel, StaffGrantModel,
  TaskModel, VaultDocumentModel,
} from '../apps/api/src/models';

/** Every collection that holds a tenant's records, keyed by orgId. Users are shared and handled separately. */
export const TENANT_COLLECTIONS: ReadonlyArray<[string, Model<never>]> = ([
  ['memberships', MembershipModel], ['staffgrants', StaffGrantModel], ['authtokens', AuthTokenModel], ['files', FileModel],
  ['documenttypes', DocumentTypeModel], ['vaultdocuments', VaultDocumentModel], ['experienceprojects', ExperienceProjectModel],
  ['personnel', PersonnelModel], ['equipment', EquipmentModel], ['requirementtemplates', RequirementTemplateModel],
  ['opportunities', OpportunityModel], ['bidpackets', BidPacketModel], ['exports', ExportModel], ['contentblocks', ContentBlockModel],
  ['proposals', ProposalModel], ['tasks', TaskModel], ['notifications', NotificationModel], ['idempotency', IdempotencyModel],
  ['auditlogs', AuditLogModel],
] as Array<[string, unknown]>) as ReadonlyArray<[string, Model<never>]>;
