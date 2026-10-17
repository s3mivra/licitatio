import { toCentavos } from './money';

/** RFC 4180: comma separated, double-quoted fields, "" escapes a quote, CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, ''); // Excel writes a BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  const esc = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

export type ImportKind = 'projects' | 'personnel' | 'equipment';

interface Column {
  header: string;
  field: string;
  required?: boolean;
  example: string;
  convert?: (v: string) => unknown;
}

const yesNo = (v: string): boolean | string => {
  const s = v.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'oo'].includes(s)) return true;
  if (['no', 'n', 'false', '0', 'hindi', ''].includes(s)) return false;
  return v; // left as text so validation reports it
};
const lower = (v: string): string => v.trim().toLowerCase().replace(/[\s-]+/g, '_');
const int = (v: string): number | string => (/^\s*\d+\s*$/.test(v) ? Number(v) : v);
const amount = (v: string): number | string => {
  try {
    return toCentavos(v);
  } catch {
    return v;
  }
};
/** Accepts YYYY-MM-DD and M/D/YYYY (Excel's default in the Philippines). */
const date = (v: string): string => {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(v);
  return m ? `${m[3]}-${m[1]?.padStart(2, '0')}-${m[2]?.padStart(2, '0')}` : v.trim();
};

export const IMPORT_COLUMNS: Record<ImportKind, Column[]> = {
  projects: [
    { header: 'Project name', field: 'name', required: true, example: 'Rehabilitation of Pasig Elementary School' },
    { header: 'Client', field: 'clientName', required: true, example: 'DepEd NCR' },
    { header: 'Client type', field: 'clientType', required: true, example: 'government', convert: lower },
    { header: 'Location', field: 'location', required: true, example: 'Pasig City' },
    { header: 'Category', field: 'category', required: true, example: 'Buildings' },
    { header: 'Role', field: 'role', required: true, example: 'main', convert: lower },
    { header: 'Contract amount (PHP)', field: 'contractAmount', required: true, example: '18,500,000.00', convert: amount },
    { header: 'Start date', field: 'startDate', example: '2024-02-01', convert: date },
    { header: 'Completion date', field: 'completionDate', example: '2024-11-30', convert: date },
    { header: 'Status', field: 'status', required: true, example: 'completed', convert: lower },
    { header: 'Scope summary', field: 'scopeSummary', example: 'Repair of 12 classrooms' },
  ],
  personnel: [
    { header: 'Full name', field: 'fullName', required: true, example: 'Engr. Liza Mercado' },
    { header: 'Position', field: 'position', required: true, example: 'Project Manager' },
    { header: 'Profession', field: 'profession', example: 'Civil Engineer' },
    { header: 'License no.', field: 'licenseNo', example: 'PRC-0098765' },
    { header: 'License valid until', field: 'licenseExpiresAt', example: '2027-05-31', convert: date },
    { header: 'Years of experience', field: 'yearsExperience', example: '14', convert: int },
    { header: 'Education', field: 'education', example: 'BS Civil Engineering' },
    { header: 'Key personnel', field: 'isKeyPersonnel', required: true, example: 'yes', convert: yesNo },
  ],
  equipment: [
    { header: 'Name', field: 'name', required: true, example: 'Backhoe' },
    { header: 'Type', field: 'type', required: true, example: 'Excavator' },
    { header: 'Make', field: 'make', example: 'Komatsu' },
    { header: 'Model', field: 'model', example: 'PC200' },
    { header: 'Quantity', field: 'quantity', required: true, example: '2', convert: int },
    { header: 'Ownership', field: 'ownership', required: true, example: 'owned', convert: lower },
    { header: 'Plate or serial no.', field: 'plateOrSerial', example: 'ABC-1234' },
    { header: 'Condition', field: 'condition', required: true, example: 'good', convert: lower },
  ],
};

export const MAX_IMPORT_ROWS = 500;

export function importTemplate(kind: ImportKind): string {
  const cols = IMPORT_COLUMNS[kind];
  return toCsv([cols.map((c) => c.header), cols.map((c) => c.example)]);
}

export interface MappedRows {
  rows: Array<{ line: number; body: Record<string, unknown> }>;
  errors: Array<{ line: number; path: string; message: string }>;
}

/** Maps CSV rows to request bodies by header name (case-insensitive). Validation happens with the register schema. */
export function mapImportRows(kind: ImportKind, table: string[][]): MappedRows {
  const errors: MappedRows['errors'] = [];
  const [header, ...data] = table;
  if (!header) return { rows: [], errors: [{ line: 1, path: 'header', message: 'The file is empty' }] };
  const norm = (s: string): string => s.trim().toLowerCase();
  const cols = IMPORT_COLUMNS[kind];
  const index = new Map(header.map((h, i) => [norm(h), i]));
  for (const c of cols) if (c.required && !index.has(norm(c.header))) errors.push({ line: 1, path: c.header, message: 'Missing column' });
  if (data.length > MAX_IMPORT_ROWS) errors.push({ line: 1, path: 'rows', message: `At most ${MAX_IMPORT_ROWS} rows per import` });
  if (errors.length > 0) return { rows: [], errors };
  const rows = data.map((cells, n) => {
    const body: Record<string, unknown> = {};
    for (const c of cols) {
      const i = index.get(norm(c.header));
      const raw = i === undefined ? '' : (cells[i] ?? '').trim();
      if (raw === '' && c.field !== 'isKeyPersonnel') continue;
      body[c.field] = c.convert ? c.convert(raw) : raw;
    }
    if (kind === 'projects') body.photoFileIds = [];
    return { line: n + 2, body };
  });
  return { rows, errors };
}
