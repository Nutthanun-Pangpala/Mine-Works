import { neon } from "@neondatabase/serverless";

/**
 * Database access.
 *
 *   await sql()`select * from t where id = ${id}`      // tagged template → rows
 *   await sql().query("select $1::int as x", [1])       // text + params → rows
 *   await tx([q1, q2])                                  // run statements in one transaction
 *
 * Uses the Neon HTTP driver by default (works on Vercel). Set DB_DRIVER=pg to
 * use a regular PostgreSQL server through node-postgres (local development).
 */

type Rows = any[];
type Query = { text: string; values: any[] };

let _neon: any;
let _pool: any;

function usePg(): boolean {
  return process.env.DB_DRIVER === "pg";
}

function pool(): any {
  if (!_pool) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool, types } = require("pg");
    types.setTypeParser(1082, (v: string) => v); // keep DATE as 'YYYY-MM-DD'
    _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  }
  return _pool;
}

function url(): string {
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error("DATABASE_URL is not set");
  return u;
}

export function toQuery(strings: TemplateStringsArray, values: any[]): Query {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) text += `$${i + 1}` + strings[i + 1];
  return { text, values };
}

function pgTag(): any {
  const fn: any = async (strings: TemplateStringsArray, ...values: any[]) => {
    const q = toQuery(strings, values);
    const r = await pool().query(q.text, q.values);
    return r.rows;
  };
  fn.query = async (text: string, params: any[] = []) => (await pool().query(text, params)).rows;
  return fn;
}

export function sql(): any {
  if (usePg()) return pgTag();
  if (!_neon) {
    const n = neon(url());
    const fn: any = (strings: TemplateStringsArray, ...values: any[]) => n(strings, ...values);
    fn.query = (text: string, params: any[] = []) => n.query(text, params);
    fn.raw = n;
    _neon = fn;
  }
  return _neon;
}

/** Build a query object for tx(). */
export function q(strings: TemplateStringsArray, ...values: any[]): Query {
  return toQuery(strings, values);
}

/** Run several statements atomically. Returns the rows of each statement. */
export async function tx(queries: Query[]): Promise<Rows[]> {
  if (queries.length === 0) return [];
  if (usePg()) {
    const c = await pool().connect();
    try {
      await c.query("begin");
      const out: Rows[] = [];
      for (const qq of queries) out.push((await c.query(qq.text, qq.values)).rows);
      await c.query("commit");
      return out;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  const n: any = (sql() as any).raw;
  return n.transaction(queries.map((qq) => n.query(qq.text, qq.values)));
}
