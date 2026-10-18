import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ComponentKind, Markups, OpportunityDto, PriceItem, PriceSheetDto } from '@licitatio/shared';
import { PLANS, checkBudget, computeSheet, formatCentavos, toCentavos, toCsv } from '@licitatio/shared';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { can, useOrg, useOrgId } from '../../lib/queries';
import { openFile } from '../../lib/upload';
import { Alert, Button, Chip, ErrorAlert, ErrorState, Skeleton, cx } from '../../ui';

const uuid = () => crypto.randomUUID();
const KINDS: Array<{ kind: ComponentKind; label: string }> = [{ kind: 'material', label: 'Material' }, { kind: 'labor', label: 'Labor' }, { kind: 'equipment', label: 'Equipment' }];
const peso = (v: number) => formatCentavos(v);
const num = (s: string): number => { const n = Number(s.replace(/,/g, '')); return Number.isFinite(n) && n >= 0 ? n : 0; };
const toCents = (s: string): number => { try { return s.trim() ? toCentavos(s) : 0; } catch { return 0; } };

/** A number field that keeps what the user types and reports a parsed value on blur. */
function NumField({ value, onCommit, label, money, className, disabled }: { value: number; onCommit: (n: number) => void; label: string; money?: boolean; className?: string; disabled?: boolean }) {
  const shown = money ? peso(value) : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  return (
    <input aria-label={label} inputMode="decimal" className={cx('input px-2 py-1.5 text-right tabular-nums', className)} value={text} disabled={disabled}
      onChange={(e) => setText(e.target.value)} onBlur={() => onCommit(money ? toCents(text) : num(text))} />
  );
}

export function PricingTab({ bid }: { bid: OpportunityDto }) {
  const orgId = useOrgId();
  const org = useOrg();
  const qc = useQueryClient();
  const key = ['org', orgId, 'opportunities', 'price-sheet', bid.id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ data: PriceSheetDto }>(`/orgs/${orgId}/opportunities/${bid.id}/price-sheet`).then((r) => r.data) });
  const [items, setItems] = useState<PriceItem[]>([]);
  const [markups, setMarkups] = useState<Markups>({ ocmPercent: 10, profitPercent: 10, vatPercent: 12 });
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (q.data && !dirty) { setItems(q.data.items); setMarkups(q.data.markups); } }, [q.data, dirty]);

  const allowed = Boolean(org.data && PLANS[org.data.plan].proposals);
  const canEdit = can(org.data, 'editor') && allowed;
  const totals = useMemo(() => computeSheet(items, markups), [items, markups]);
  const budget = bid.approvedBudget ? checkBudget(totals.total, bid.approvedBudget) : null;

  const save = useMutation({
    mutationFn: () => api.put<{ data: PriceSheetDto }>(`/orgs/${orgId}/opportunities/${bid.id}/price-sheet`, { rev: q.data?.rev ?? 0, items, markups }).then((r) => r.data),
    onSuccess: (d) => { qc.setQueryData(key, d); setDirty(false); },
    onError: (e) => { if (e instanceof ApiError && e.code === 'rev_conflict') void q.refetch(); },
  });
  const exportPdf = useMutation({
    mutationFn: () => api.post<{ data: { fileId: string } }>(`/orgs/${orgId}/opportunities/${bid.id}/price-sheet/export`, { format: 'pdf' }).then((r) => r.data.fileId),
    onSuccess: (id) => void openFile(orgId, id),
  });

  const update = (next: PriceItem[]) => { setItems(next); setDirty(true); };
  const patchItem = (id: string, patch: Partial<PriceItem>) => update(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const addItem = () => {
    const item: PriceItem = { id: uuid(), itemNo: String(items.length + 1), description: 'New pay item', unit: 'l.s.', quantity: 1, components: [] };
    update([...items, item]);
    setOpen(item.id);
  };
  const downloadCsv = () => {
    const rows = [
      ['Item no.', 'Description', 'Unit', 'Quantity', 'Unit price (PHP)', 'Amount (PHP)'],
      ...items.map((i, idx) => [i.itemNo, i.description, i.unit, String(i.quantity), peso(totals.items[idx]?.unitPrice ?? 0), peso(totals.items[idx]?.amount ?? 0)]),
      ['', 'Total bid price', '', '', '', peso(totals.total)],
    ];
    const url = URL.createObjectURL(new Blob([`\uFEFF${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'bill-of-quantities.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <div className="space-y-4">
      {!allowed && <Alert tone="info">The price builder is included in the Pro and Desk plans.</Alert>}

      <section className="card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-mono text-xs text-slate-500">Total bid price</p>
            <p className="mt-1 font-display text-3xl font-bold tabular-nums sm:text-4xl">PHP {peso(totals.total)}</p>
            {budget ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <Chip tone={budget.withinBudget ? 'green' : 'red'}>{budget.withinBudget ? 'Within the approved budget' : 'Over the approved budget'}</Chip>
                <span className="text-slate-600">{budget.percentOfBudget}% of PHP {peso(budget.approvedBudget)}{budget.withinBudget ? `, PHP ${peso(budget.difference)} below` : `, PHP ${peso(-budget.difference)} over`}</span>
              </div>
            ) : <p className="mt-2 text-sm text-slate-500">Add the approved budget to the bid to check the price against it.</p>}
            {budget && !budget.withinBudget && <p className="mt-2 text-sm text-red-700">Bids above the approved budget are usually rejected. Review your quantities, costs or markups.</p>}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4 lg:grid-cols-2">
            {[['Direct cost', totals.direct], ['Overhead (OCM)', totals.ocm], ['Profit', totals.profit], ['VAT', totals.vat]].map(([l, v]) => (
              <div key={l as string}><dt className="font-mono text-[11px] text-slate-500">{l}</dt><dd className="tabular-nums">PHP {peso(v as number)}</dd></div>
            ))}
          </dl>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid grid-cols-3 gap-3">
            {([['ocmPercent', 'OCM %'], ['profitPercent', 'Profit %'], ['vatPercent', 'VAT %']] as const).map(([k, l]) => (
              <label key={k} className="text-xs font-semibold">{l}
                <NumField label={l} value={markups[k]} disabled={!canEdit} className="mt-1 w-24" onCommit={(n) => { setMarkups({ ...markups, [k]: Math.min(100, n) }); setDirty(true); }} />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={items.length === 0} onClick={downloadCsv}>Download CSV</Button>
            <Button variant="secondary" disabled={items.length === 0 || dirty || !allowed} busy={exportPdf.isPending} onClick={() => exportPdf.mutate()} title={dirty ? 'Save first' : undefined}>Export PDF</Button>
            {canEdit && <Button disabled={!dirty} busy={save.isPending} onClick={() => save.mutate()}>{dirty ? 'Save prices' : 'Saved'}</Button>}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">OCM and profit are percentages of the direct cost; VAT applies to the direct cost plus markups. Defaults are starting points: confirm them for each project.</p>
        {save.error && <div className="mt-3"><ErrorAlert error={save.error} /></div>}
        {exportPdf.error && <div className="mt-3"><ErrorAlert error={exportPdf.error} /></div>}
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-medium">Bill of quantities</h2>
          {canEdit && <Button variant="secondary" onClick={addItem}>Add pay item</Button>}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">No pay items yet. Add each item from the bid's bill of quantities, then build its unit price from materials, labor and equipment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((i, idx) => {
              const c = totals.items[idx];
              const isOpen = open === i.id;
              return (
                <li key={i.id} className="px-4 py-3">
                  <div className="grid grid-cols-[4.5rem_1fr] gap-2 sm:grid-cols-[5rem_1fr_5rem_7rem_auto] sm:items-center">
                    <input aria-label="Item no." className="input px-2 py-1.5 font-mono text-xs" value={i.itemNo} disabled={!canEdit} maxLength={30} onChange={(e) => patchItem(i.id, { itemNo: e.target.value })} />
                    <input aria-label="Description" className="input px-2 py-1.5" value={i.description} disabled={!canEdit} maxLength={500} onChange={(e) => patchItem(i.id, { description: e.target.value })} />
                    <input aria-label="Unit" className="input px-2 py-1.5" value={i.unit} disabled={!canEdit} maxLength={20} onChange={(e) => patchItem(i.id, { unit: e.target.value })} />
                    <NumField label="Quantity" value={i.quantity} disabled={!canEdit} onCommit={(n) => patchItem(i.id, { quantity: n })} />
                    <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-end">
                      <div className="text-right text-sm"><p className="font-semibold tabular-nums">PHP {peso(c?.amount ?? 0)}</p><p className="font-mono text-[11px] text-slate-500">{peso(c?.unitPrice ?? 0)} / {i.unit || 'unit'}</p></div>
                      <Button variant="ghost" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i.id)}>{isOpen ? 'Hide' : 'Unit price'}</Button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="font-mono text-xs text-slate-500">Unit price analysis, per one {i.unit || 'unit'}</p>
                      {i.components.length === 0 && <p className="mt-2 text-sm text-slate-500">Add the materials, labor and equipment needed for one {i.unit || 'unit'} of this item.</p>}
                      <ul className="mt-2 space-y-2">
                        {i.components.map((p, pi) => {
                          const setComp = (patch: Partial<typeof p>) => patchItem(i.id, { components: i.components.map((x, xi) => (xi === pi ? { ...x, ...patch } : x)) });
                          return (
                            <li key={pi} className="grid grid-cols-2 gap-2 sm:grid-cols-[7rem_1fr_5rem_5rem_7rem_6rem_auto] sm:items-center">
                              <select aria-label="Component type" className="input px-2 py-1.5" value={p.kind} disabled={!canEdit} onChange={(e) => setComp({ kind: e.target.value as ComponentKind })}>
                                {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                              </select>
                              <input aria-label="Component description" className="input px-2 py-1.5" value={p.description} disabled={!canEdit} maxLength={200} onChange={(e) => setComp({ description: e.target.value })} />
                              <NumField label="Component quantity" value={p.quantity} disabled={!canEdit} onCommit={(n) => setComp({ quantity: n })} />
                              <input aria-label="Component unit" className="input px-2 py-1.5" value={p.unit} disabled={!canEdit} maxLength={20} placeholder="unit" onChange={(e) => setComp({ unit: e.target.value })} />
                              <NumField label="Unit cost (PHP)" money value={p.unitCost} disabled={!canEdit} onCommit={(n) => setComp({ unitCost: n })} />
                              <p className="text-right text-sm tabular-nums">{peso(Math.round(p.quantity * p.unitCost))}</p>
                              {canEdit && <Button variant="ghost" className="text-red-700" aria-label="Remove component" onClick={() => patchItem(i.id, { components: i.components.filter((_, xi) => xi !== pi) })}>Remove</Button>}
                            </li>
                          );
                        })}
                      </ul>
                      {canEdit && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {KINDS.map((k) => (
                            <Button key={k.kind} variant="secondary" disabled={i.components.length >= 40}
                              onClick={() => patchItem(i.id, { components: [...i.components, { kind: k.kind, description: k.label, unit: '', quantity: 1, unitCost: 0 }] })}>Add {k.label.toLowerCase()}</Button>
                          ))}
                        </div>
                      )}
                      {c && (
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-200 pt-3 text-sm sm:grid-cols-5">
                          {[['Direct', c.direct], [`OCM ${markups.ocmPercent}%`, c.ocm], [`Profit ${markups.profitPercent}%`, c.profit], [`VAT ${markups.vatPercent}%`, c.vat], ['Unit price', c.unitPrice]].map(([l, v]) => (
                            <div key={l as string}><dt className="font-mono text-[11px] text-slate-500">{l}</dt><dd className="tabular-nums">{peso(v as number)}</dd></div>
                          ))}
                        </dl>
                      )}
                      {canEdit && <div className="mt-3 text-right"><Button variant="ghost" className="text-red-700" onClick={() => { update(items.filter((x) => x.id !== i.id)); setOpen(null); }}>Remove pay item</Button></div>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
