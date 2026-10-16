import type { VaultDocumentDto } from '@licitatio/shared';
import { relativeDays } from '../../lib/format';
import { Chip } from '../../ui';

export function ExpiryChip({ expiry, archived }: { expiry: VaultDocumentDto['expiry']; archived?: boolean }) {
  if (archived) return <Chip>Archived</Chip>;
  switch (expiry.state) {
    case 'expired':
      return <Chip tone="red">Expired</Chip>;
    case 'expiring':
      return <Chip tone="amber">{relativeDays(expiry.daysRemaining)}</Chip>;
    case 'valid':
      return <Chip tone="green">Valid</Chip>;
    case 'no_expiry':
      return <Chip>No expiry</Chip>;
  }
}
