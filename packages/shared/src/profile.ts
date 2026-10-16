import type { CompanyProfile } from './domain';

/** Keys the exports need. An empty list means the profile is complete enough to export. */
export function profileGaps(p: Partial<CompanyProfile> | undefined): string[] {
  const gaps: string[] = [];
  if (!p?.legalName) gaps.push('legalName');
  if (!p?.address?.line1) gaps.push('address.line1');
  if (!p?.address?.city) gaps.push('address.city');
  if (!p?.address?.province) gaps.push('address.province');
  if (!p?.signatory?.name) gaps.push('signatory.name');
  if (!p?.signatory?.position) gaps.push('signatory.position');
  return gaps;
}
