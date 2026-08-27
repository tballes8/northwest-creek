// Shared CSV export plumbing. Extracted when the transaction history export was
// added so the escaping, BOM, and blob/anchor dance live in exactly one place —
// the escaping in particular is easy to get subtly wrong per copy.

/** RFC-4180 quoting: only quote when the value could break a field or row. */
export const csvEscape = (v: string | number | null | undefined): string => {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/**
 * Build a CSV from already-ordered rows and hand it to the browser as a download.
 * Rows are escaped here, so callers pass raw values (pre-formatted numbers are
 * fine — formatting is a presentation choice per column).
 *
 * The leading BOM is load-bearing: without it Excel opens UTF-8 as the local
 * ANSI codepage and mangles any non-ASCII ticker name or note. CRLF line endings
 * for the same reason.
 */
export const downloadCSV = (
  filename: string,
  header: string[],
  rows: Array<Array<string | number | null | undefined>>
): void => {
  const lines = [header.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
