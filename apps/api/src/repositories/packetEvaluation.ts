import type { BidPacket, Opportunity } from '@licitatio/shared';
import { manilaDateOf } from '@licitatio/shared';
import { evaluatePacket } from '../domain/packetEvaluation';
import type { PacketEvaluation, VaultIndexEntry } from '../domain/packetEvaluation';
import { VaultDocumentModel } from '../models';

/** Loads the vault documents a packet references and runs the pure evaluation. */
export async function evaluateStoredPacket(packet: Pick<BidPacket, 'orgId' | 'items'>, opportunity: Pick<Opportunity, 'submissionDeadlineAt' | 'openingAt'>): Promise<PacketEvaluation> {
  const ids = packet.items.map((i) => i.vaultDocumentId).filter((id): id is string => Boolean(id));
  const docs = ids.length > 0 ? await VaultDocumentModel.find({ orgId: packet.orgId, _id: { $in: ids } }, { docTypeCode: 1, 'current.expiresAt': 1, archivedAt: 1 }).lean() : [];
  const vault = new Map<string, VaultIndexEntry>(
    docs.map((d) => [String(d._id), { id: String(d._id), docTypeCode: d.docTypeCode, expiresAt: d.current.expiresAt ?? null, archived: d.archivedAt !== null }]),
  );
  return evaluatePacket(packet.items, {
    submissionDate: manilaDateOf(opportunity.submissionDeadlineAt),
    openingDate: opportunity.openingAt ? manilaDateOf(opportunity.openingAt) : undefined,
    vault,
  });
}
