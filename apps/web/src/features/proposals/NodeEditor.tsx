import type { BlockNode } from '@licitatio/shared';
import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { useOrgId } from '../../lib/queries';
import { uploadFile } from '../../lib/upload';
import { Button, Checkbox, Select, TextArea, TextInput } from '../../ui';

export const NODE_LABEL: Record<BlockNode['type'], string> = {
  heading: 'Heading', paragraph: 'Paragraph', list: 'List', table: 'Table', dataTable: 'Records table', image: 'Image', pageBreak: 'Page break',
};

export function emptyNode(type: BlockNode['type']): BlockNode {
  switch (type) {
    case 'heading': return { type, level: 2, runs: [{ text: '' }] };
    case 'paragraph': return { type, runs: [{ text: '' }] };
    case 'list': return { type, ordered: false, items: [[{ text: '' }]] };
    case 'table': return { type, header: ['Column 1', 'Column 2'], rows: [['', '']] };
    case 'dataTable': return { type, source: 'projects', limit: 10, filter: 'completed' };
    case 'image': return { type, fileId: '', widthPercent: 60 };
    case 'pageBreak': return { type };
  }
}

const textOf = (runs: Array<{ text: string }>): string => runs.map((r) => r.text).join('');

/** Editing is per node: text nodes keep one run, so bold and italic apply to the whole paragraph. */
export function NodeEditor({ node, onChange }: { node: BlockNode; onChange: (n: BlockNode) => void }) {
  const orgId = useOrgId();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  switch (node.type) {
    case 'heading':
      return (
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Select label="Level" value={String(node.level)} onChange={(e) => onChange({ ...node, level: Number(e.target.value) as 2 | 3 })}
            options={[{ value: '2', label: 'Heading 2' }, { value: '3', label: 'Heading 3' }]} />
          <TextInput label="Heading text" value={textOf(node.runs)} onChange={(e) => onChange({ ...node, runs: [{ text: e.target.value }] })} />
        </div>
      );
    case 'paragraph': {
      const run = node.runs[0] ?? { text: '' };
      return (
        <div className="space-y-2">
          <TextArea label="Text" hint="Insert variables such as {{org.legalName}}" value={textOf(node.runs)} onChange={(e) => onChange({ ...node, runs: [{ ...run, text: e.target.value }] })} />
          <div className="flex gap-4">
            <Checkbox label="Bold" checked={run.bold === true} onChange={(e) => onChange({ ...node, runs: [{ ...run, text: textOf(node.runs), bold: e.target.checked || undefined }] })} />
            <Checkbox label="Italic" checked={run.italic === true} onChange={(e) => onChange({ ...node, runs: [{ ...run, text: textOf(node.runs), italic: e.target.checked || undefined }] })} />
          </div>
        </div>
      );
    }
    case 'list':
      return (
        <div className="space-y-2">
          <TextArea label="Items" hint="One item per line" value={node.items.map(textOf).join('\n')}
            onChange={(e) => onChange({ ...node, items: (e.target.value.split('\n').length > 0 ? e.target.value.split('\n') : ['']).map((t) => [{ text: t }]) })} />
          <Checkbox label="Numbered" checked={node.ordered} onChange={(e) => onChange({ ...node, ordered: e.target.checked })} />
        </div>
      );
    case 'table':
      return (
        <div className="space-y-2">
          <TextInput label="Columns" hint="Separate with |, up to 8" value={node.header.join(' | ')}
            onChange={(e) => {
              const header = e.target.value.split('|').map((s) => s.trim()).slice(0, 8);
              onChange({ ...node, header, rows: node.rows.map((r) => header.map((_, i) => r[i] ?? '')) });
            }} />
          <TextArea label="Rows" hint="One row per line, cells separated with |" value={node.rows.map((r) => r.join(' | ')).join('\n')}
            onChange={(e) => onChange({ ...node, rows: e.target.value.split('\n').map((line) => { const cells = line.split('|').map((s) => s.trim()); return node.header.map((_, i) => cells[i] ?? ''); }) })} />
        </div>
      );
    case 'dataTable':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Records" value={node.source} onChange={(e) => onChange({ ...node, source: e.target.value as 'projects', filter: e.target.value === 'projects' ? 'completed' : e.target.value === 'personnel' ? 'key' : undefined })}
            options={[{ value: 'projects', label: 'Experience projects' }, { value: 'personnel', label: 'Personnel' }, { value: 'equipment', label: 'Equipment' }]} />
          {node.source !== 'equipment' && (
            <Select label="Show" value={node.filter ?? 'all'} onChange={(e) => onChange({ ...node, filter: e.target.value as 'all' })}
              options={node.source === 'projects'
                ? [{ value: 'all', label: 'All' }, { value: 'completed', label: 'Completed' }, { value: 'ongoing', label: 'Ongoing' }]
                : [{ value: 'all', label: 'Everyone' }, { value: 'key', label: 'Key personnel' }]} />
          )}
          <TextInput label="Up to" type="number" min={1} max={50} value={node.limit} onChange={(e) => onChange({ ...node, limit: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />
          <p className="text-xs text-slate-500 sm:col-span-3">Filled from your registers when exported, so it is always current.</p>
        </div>
      );
    case 'image':
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept="image/png,image/jpeg" aria-label="Image file" className="text-sm"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploadError(null);
                setUploading(true);
                try {
                  onChange({ ...node, fileId: (await uploadFile(orgId, f)).id });
                } catch (err) {
                  setUploadError(err instanceof ApiError ? err.message : 'Upload failed');
                } finally {
                  setUploading(false);
                }
              }} />
            {uploading && <span className="text-sm text-slate-500">Uploading…</span>}
            {node.fileId && !uploading && <span className="text-sm text-emerald-700">Image attached</span>}
          </div>
          {uploadError && <p className="text-sm text-red-700" role="alert">{uploadError}</p>}
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <TextInput label="Width %" type="number" min={10} max={100} value={node.widthPercent} onChange={(e) => onChange({ ...node, widthPercent: Math.max(10, Math.min(100, Number(e.target.value) || 10)) })} />
            <TextInput label="Caption" value={node.caption ?? ''} onChange={(e) => onChange({ ...node, caption: e.target.value || undefined })} />
          </div>
        </div>
      );
    case 'pageBreak':
      return <p className="text-sm text-slate-500">Starts a new page.</p>;
  }
}

export function NodeList({ nodes, onChange }: { nodes: BlockNode[]; onChange: (n: BlockNode[]) => void }) {
  const [adding, setAdding] = useState<BlockNode['type']>('paragraph');
  const move = (i: number, d: -1 | 1) => {
    const next = [...nodes];
    const [n] = next.splice(i, 1);
    if (n) next.splice(i + d, 0, n);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {nodes.map((n, i) => (
        <div key={i} className="rounded-md border-2 border-slate-300 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{NODE_LABEL[n.type]}</span>
            <div className="flex gap-1">
              <Button variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
              <Button variant="ghost" aria-label="Move down" disabled={i === nodes.length - 1} onClick={() => move(i, 1)}>↓</Button>
              <Button variant="ghost" className="text-red-700" onClick={() => onChange(nodes.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          </div>
          <NodeEditor node={n} onChange={(next) => onChange(nodes.map((x, j) => (j === i ? next : x)))} />
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48"><Select label="Add content" value={adding} onChange={(e) => setAdding(e.target.value as BlockNode['type'])} options={Object.entries(NODE_LABEL).map(([v, l]) => ({ value: v, label: l }))} /></div>
        <Button variant="secondary" onClick={() => onChange([...nodes, emptyNode(adding)])}>Add</Button>
      </div>
    </div>
  );
}
