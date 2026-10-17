import { useMutation } from '@tanstack/react-query';
import type { ImportKind } from '@licitatio/shared';
import { MAX_IMPORT_ROWS, importTemplate } from '@licitatio/shared';
import { useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { useOrgId } from '../../lib/queries';
import { Alert, Button, Dialog, Field } from '../../ui';

interface Problem { line?: number; field?: string; path: string; message: string }

/** Check first (dry run), then import. The server rejects the whole file if any row is invalid. */
export function ImportDialog({ kind, noun, open, onClose, onDone }: { kind: ImportKind; noun: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const orgId = useOrgId();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [checked, setChecked] = useState<number | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const reset = () => { setCsv(null); setFileName(''); setChecked(null); setProblems([]); setMessage(null); };
  const run = useMutation({
    mutationFn: (dryRun: boolean) => api.post<{ data: { valid: number; imported: number } }>(`/orgs/${orgId}/${kind}/import`, { csv, dryRun }),
    onSuccess: (r, dryRun) => {
      setProblems([]);
      setMessage(null);
      if (dryRun) setChecked(r.data.valid);
      else { onDone(); reset(); onClose(); }
    },
    onError: (e) => {
      setChecked(null);
      if (e instanceof ApiError && Array.isArray(e.details)) { setProblems(e.details as Problem[]); setMessage(e.message); }
      else setMessage(e instanceof ApiError ? e.message : 'Import failed');
    },
  });
  const download = () => {
    const url = URL.createObjectURL(new Blob([importTemplate(kind)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `licitatio-${kind}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} title={`Import ${noun} from CSV`} wide
      footer={<>
        <Button variant="secondary" onClick={() => { reset(); onClose(); }}>Cancel</Button>
        {checked === null
          ? <Button disabled={!csv} busy={run.isPending} onClick={() => run.mutate(true)}>Check file</Button>
          : <Button busy={run.isPending} onClick={() => run.mutate(false)}>Import {checked} row{checked === 1 ? '' : 's'}</Button>}
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Save your Excel sheet as CSV with the template's column headers. Up to {MAX_IMPORT_ROWS} rows. Files and photos are added afterwards from each record.</p>
        <Button variant="secondary" onClick={download}>Download template</Button>
        <Field label="CSV file" htmlFor="import-file">
          <input id="import-file" type="file" accept=".csv,text/csv" className="block w-full text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              reset();
              if (!f) return;
              if (f.size > 900_000) { setMessage('The file is too large. Split it into smaller files.'); return; }
              setFileName(f.name);
              setCsv(await f.text());
            }} />
        </Field>
        {fileName && checked === null && problems.length === 0 && !message && <p className="text-sm text-slate-500">Ready to check {fileName}.</p>}
        {checked !== null && <Alert tone="success">All {checked} rows are valid. Press Import to add them.</Alert>}
        {message && <Alert>{message}</Alert>}
        {problems.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded border border-red-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-red-50 text-xs uppercase text-red-800"><tr><th className="px-3 py-2">Line</th><th className="px-3 py-2">Column</th><th className="px-3 py-2">Problem</th></tr></thead>
              <tbody className="divide-y divide-red-100">
                {problems.map((p, i) => <tr key={i}><td className="px-3 py-1.5">{p.line ?? ''}</td><td className="px-3 py-1.5">{p.field ?? p.path}</td><td className="px-3 py-1.5">{p.message}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}
