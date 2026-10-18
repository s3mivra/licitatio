import { describe, expect, it } from 'vitest';
import type { PriceItem } from './pricing';
import { DEFAULT_MARKUPS, checkBudget, computeSheet, costItem, roundQty } from './pricing';

const P = 100; // one peso in centavos
const concrete: PriceItem = {
  id: 'a', itemNo: '900(1)', description: 'Structural concrete', unit: 'cu.m', quantity: 10,
  components: [
    { kind: 'material', description: 'Cement', unit: 'bag', quantity: 9, unitCost: 280 * P },
    { kind: 'material', description: 'Sand', unit: 'cu.m', quantity: 0.5, unitCost: 1_200 * P },
    { kind: 'labor', description: 'Mason', unit: 'day', quantity: 0.5, unitCost: 800 * P },
    { kind: 'equipment', description: 'Mixer', unit: 'hour', quantity: 2, unitCost: 300 * P },
  ],
};

describe('price builder', () => {
  it('builds a unit price from components, OCM, profit and VAT', () => {
    const c = costItem(concrete, DEFAULT_MARKUPS);
    expect(c.material).toBe(3_120 * P); // 2,520 + 600
    expect(c.labor).toBe(400 * P);
    expect(c.equipment).toBe(600 * P);
    expect(c.direct).toBe(4_120 * P);
    expect(c.ocm).toBe(412 * P);
    expect(c.profit).toBe(412 * P);
    expect(c.vat).toBe(593_28); // 12% of 4,944.00 = 593.28 pesos
    expect(c.unitPrice).toBe(5_537_28);
    expect(c.amount).toBe(55_372_80);
  });

  it('totals a sheet and checks it against the approved budget', () => {
    const lumpSum: PriceItem = { id: 'b', itemNo: '1', description: 'Mobilization', unit: 'l.s.', quantity: 1, components: [{ kind: 'labor', description: 'Crew', unit: 'l.s.', quantity: 1, unitCost: 10_000 * P }] };
    const t = computeSheet([concrete, lumpSum], { ocmPercent: 0, profitPercent: 0, vatPercent: 0 });
    expect(t.total).toBe(41_200 * P + 10_000 * P);
    expect(t.direct).toBe(t.total);
    const over = checkBudget(t.total, 50_000 * P);
    expect(over.withinBudget).toBe(false);
    expect(over.difference).toBe(-1_200 * P);
    expect(over.percentOfBudget).toBe(102.4);
    expect(checkBudget(t.total, t.total).withinBudget).toBe(true);
  });

  it('handles an item with no components and rounds quantities', () => {
    expect(costItem({ ...concrete, components: [] }, DEFAULT_MARKUPS).amount).toBe(0);
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
  });
});
