import type { Centavos } from './domain';

/**
 * Bid price builder math. Each pay item has a unit price analysis: materials, labor and equipment per
 * one unit of work make the direct cost; overhead (OCM) and profit are percentages of the direct cost;
 * VAT applies to direct cost plus markups. Defaults are common starting points to be confirmed by the
 * estimator for each project; bids above the approved budget are usually rejected.
 */
export const COMPONENT_KINDS = ['material', 'labor', 'equipment'] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export const DEFAULT_MARKUPS = { ocmPercent: 10, profitPercent: 10, vatPercent: 12 } as const;

export interface PriceComponent {
  kind: ComponentKind;
  description: string;
  unit: string;
  quantity: number; // per one unit of the pay item, up to 4 decimals
  unitCost: Centavos;
}
export interface PriceItem {
  id: string; // client-generated uuid
  itemNo: string; // e.g. "801(1)" or "1.1"
  description: string;
  unit: string; // e.g. "cu.m", "l.s."
  quantity: number; // up to 4 decimals
  components: PriceComponent[];
}
export interface Markups {
  ocmPercent: number;
  profitPercent: number;
  vatPercent: number;
}

export interface ItemCost {
  id: string;
  material: Centavos;
  labor: Centavos;
  equipment: Centavos;
  direct: Centavos; // per unit
  ocm: Centavos;
  profit: Centavos;
  vat: Centavos;
  unitPrice: Centavos;
  amount: Centavos; // unitPrice x quantity
}

export interface SheetTotals {
  items: ItemCost[];
  direct: Centavos; // sum of direct x quantity
  ocm: Centavos;
  profit: Centavos;
  vat: Centavos;
  total: Centavos; // sum of item amounts
}

const pct = (base: number, percent: number): number => Math.round((base * percent) / 100);

export function costItem(item: PriceItem, m: Markups): ItemCost {
  const by = (kind: ComponentKind) => Math.round(item.components.filter((c) => c.kind === kind).reduce((s, c) => s + c.quantity * c.unitCost, 0));
  const material = by('material');
  const labor = by('labor');
  const equipment = by('equipment');
  const direct = material + labor + equipment;
  const ocm = pct(direct, m.ocmPercent);
  const profit = pct(direct, m.profitPercent);
  const vat = pct(direct + ocm + profit, m.vatPercent);
  const unitPrice = direct + ocm + profit + vat;
  return { id: item.id, material, labor, equipment, direct, ocm, profit, vat, unitPrice, amount: Math.round(unitPrice * item.quantity) };
}

export function computeSheet(items: readonly PriceItem[], m: Markups): SheetTotals {
  const costs = items.map((i) => costItem(i, m));
  const sum = (f: (c: ItemCost, q: number) => number) => costs.reduce((s, c, idx) => s + f(c, items[idx]?.quantity ?? 0), 0);
  return {
    items: costs,
    direct: Math.round(sum((c, q) => c.direct * q)),
    ocm: Math.round(sum((c, q) => c.ocm * q)),
    profit: Math.round(sum((c, q) => c.profit * q)),
    vat: Math.round(sum((c, q) => c.vat * q)),
    total: costs.reduce((s, c) => s + c.amount, 0),
  };
}

export interface BudgetCheck {
  total: Centavos;
  approvedBudget: Centavos;
  withinBudget: boolean;
  difference: Centavos; // budget minus total; negative means over budget
  percentOfBudget: number; // one decimal
}

export function checkBudget(total: Centavos, approvedBudget: Centavos): BudgetCheck {
  return {
    total, approvedBudget, withinBudget: total <= approvedBudget, difference: approvedBudget - total,
    percentOfBudget: approvedBudget > 0 ? Math.round((total / approvedBudget) * 1000) / 10 : 0,
  };
}

/** Quantities are stored as plain numbers; round to 4 decimals to avoid float noise. */
export const roundQty = (q: number): number => Math.round(q * 10_000) / 10_000;
