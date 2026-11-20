import { sql } from "./db";

export const MAX_FILE = 4 * 1024 * 1024;

/** Store an uploaded file from a form field. Returns file id, null when empty, or "too_big". */
export async function saveUpload(fd: FormData, key: string, userId: number): Promise<number | null | "too_big"> {
  const f = fd.get(key) as any;
  if (!f || typeof f === "string" || !f.size) return null;
  if (f.size > MAX_FILE) return "too_big";
  const buf = Buffer.from(await f.arrayBuffer());
  const ins = await sql()`
    insert into files (name, mime, size, data, created_by)
    values (${String(f.name || "file")}, ${String(f.type || "application/octet-stream")}, ${f.size}, ${buf}, ${userId})
    returning id`;
  return ins[0].id;
}
