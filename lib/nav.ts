import { redirect } from "next/navigation";

/** Redirect back to a page with ?ok= or ?error= (keeps existing query string). */
export function back(path: string, params: Record<string, string | number | null | undefined> = { ok: 1 }): never {
  const [p, qs] = path.split("?");
  const sp = new URLSearchParams(qs || "");
  sp.delete("ok");
  sp.delete("error");
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) sp.set(k, String(v));
  const s = sp.toString();
  redirect(s ? `${p}?${s}` : p);
}

export function isDup(e: any): boolean {
  return e?.code === "23505" || /duplicate key/i.test(String(e?.message));
}
export function isFk(e: any): boolean {
  return e?.code === "23503" || /foreign key/i.test(String(e?.message));
}
