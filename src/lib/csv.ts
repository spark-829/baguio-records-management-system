/** One quoted CSV field. Prevents spreadsheet formula injection and escapes quotes. */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** A whole CSV file for Excel: byte-order mark first (so ñ and dashes show), CRLF between lines. */
export function csvDocument(header: string[], rows: unknown[][]): string {
  return "﻿" + [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
}
