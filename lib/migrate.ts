// First-run database initialisation: creates the schema and seed data from db/*.sql
// when the connected database is empty, so a new deployment only needs DATABASE_URL.
import fs from "fs";
import path from "path";
import { sql, tx } from "./db";

/** Split a SQL script into statements (handles comments, quotes and dollar-quoting). */
export function splitSql(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (c === "-" && n === "-") {
      const e = text.indexOf("\n", i);
      i = e < 0 ? text.length : e + 1;
      cur += "\n";
      continue;
    }
    if (c === "/" && n === "*") {
      const e = text.indexOf("*/", i + 2);
      i = e < 0 ? text.length : e + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === c) {
          if (text[j + 1] === c) j += 2;
          else break;
        } else j++;
      }
      cur += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "$") {
      const m = /^\$[A-Za-z_]*\$/.exec(text.slice(i));
      if (m) {
        const e = text.indexOf(m[0], i + m[0].length);
        const end = e < 0 ? text.length : e + m[0].length;
        cur += text.slice(i, end);
        i = end;
        continue;
      }
    }
    if (c === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function readScript(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "db", name), "utf8");
}

export type SchemaState = "ready" | "empty" | "foreign";

export async function schemaState(): Promise<SchemaState> {
  const r = await sql()`
    select to_regclass('public.payroll_lines') is not null as v2, to_regclass('public.employees') is not null as emp`;
  if (r[0].v2) return "ready";
  return r[0].emp ? "foreign" : "empty";
}

/**
 * Creates tables and default data when the database is empty.
 * Refuses to touch a database that already holds another application's tables.
 */
export async function ensureSchema(): Promise<SchemaState | "initialized"> {
  const state = await schemaState();
  if (state !== "empty") return state;
  const statements = [...splitSql(readScript("schema.sql")), ...splitSql(readScript("seed.sql"))];
  await tx(statements.map((text) => ({ text, values: [] })));
  return "initialized";
}
