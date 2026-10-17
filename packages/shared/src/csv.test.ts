import { describe, expect, it } from 'vitest';
import { IMPORT_COLUMNS, importTemplate, mapImportRows, parseCsv, toCsv } from './csv';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas and newlines, CRLF and a BOM', () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n\r\n1,2,3';
    expect(parseCsv(text)).toEqual([['a', 'b', 'c'], ['x, y', 'say "hi"', 'line1\nline2'], ['1', '2', '3']]);
  });
  it('round-trips through toCsv', () => {
    const rows = [['a,b', 'c"d', 'e']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('mapImportRows', () => {
  it('maps headers case-insensitively and converts amounts, dates, booleans and enums', () => {
    const csv = 'full name,POSITION,Key personnel,License valid until,Years of experience\nEngr. A,PE,yes,5/31/2027,14\nB,Foreman,no,,';
    const { rows, errors } = mapImportRows('personnel', parseCsv(csv));
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({ line: 2, body: { fullName: 'Engr. A', position: 'PE', isKeyPersonnel: true, licenseExpiresAt: '2027-05-31', yearsExperience: 14 } });
    expect(rows[1]?.body).toEqual({ fullName: 'B', position: 'Foreman', isKeyPersonnel: false });
    const p = mapImportRows('projects', parseCsv(importTemplate('projects')));
    expect(p.rows[0]?.body).toMatchObject({ contractAmount: 1_850_000_000, clientType: 'government', status: 'completed', photoFileIds: [] });
  });
  it('reports missing required columns and too many rows', () => {
    expect(mapImportRows('equipment', parseCsv('Name\nBackhoe')).errors.map((e) => e.path)).toEqual(['Type', 'Quantity', 'Ownership', 'Condition']);
    const many = ['Name,Type,Quantity,Ownership,Condition', ...Array.from({ length: 501 }, () => 'a,b,1,owned,good')].join('\n');
    expect(mapImportRows('equipment', parseCsv(many)).errors[0]?.message).toMatch(/500/);
    expect(mapImportRows('equipment', [])).toMatchObject({ errors: [{ message: 'The file is empty' }] });
  });
  it('has an example for every column', () => {
    for (const cols of Object.values(IMPORT_COLUMNS)) for (const c of cols) expect(c.example).not.toBe('');
  });
});
