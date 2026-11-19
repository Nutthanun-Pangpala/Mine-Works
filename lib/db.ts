import { neon } from "@neondatabase/serverless";

let _sql: any;

// Usage: await sql()`select * from t where id = ${id}`  or  await sql().query(text, params)
export function sql(): any {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _sql = neon(url);
  }
  return _sql;
}
