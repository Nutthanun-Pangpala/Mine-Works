/** Minimal RFC-4180 CSV parser (handles quotes, commas and newlines in quotes, BOM). */
export function parseCSV(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

export function toCSV(rows: any[][]): string {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export function csvResponse(name: string, rows: any[][]): Response {
  return new Response(toCSV(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}

export const EMP_COLUMNS = [
  "code", "title", "first_name", "last_name", "first_name_en", "last_name_en", "nickname", "gender", "birth_date", "national_id",
  "work_email", "mobile", "start_date", "status", "company_code", "branch_code", "unit_name", "position_name", "supervisor_code",
  "shift_code", "employment_type_code", "employee_type", "salary", "bank_name", "bank_account", "password",
];

