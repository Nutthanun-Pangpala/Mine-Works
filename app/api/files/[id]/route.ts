import { NextResponse } from "next/server";
import { can, getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return new NextResponse("unauthorized", { status: 401 });
  const id = Number((await params).id);
  const f = (await sql()`select id, name, mime, data, created_by from files where id = ${id}`)[0];
  if (!f) return new NextResponse("not found", { status: 404 });
  let ok = f.created_by === u.id || can(u, "employees") || can(u, "team");
  if (!ok) {
    const r = await sql()`
      select 1 from requests r left join request_steps s on s.request_id = r.id
      where r.file_id = ${id} and (r.employee_id = ${u.id} or s.approver_id = ${u.id}) limit 1`;
    const a = await sql()`select 1 from employee_attachments where file_id = ${id} and employee_id = ${u.id} limit 1`;
    const c = await sql()`select 1 from companies where logo_file_id = ${id} union select 1 from employees where photo_file_id = ${id} limit 1`;
    ok = !!(r[0] || a[0] || c[0]);
  }
  if (!ok) return new NextResponse("forbidden", { status: 403 });
  const data: Buffer = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data).replace(/^\\x/, ""), "hex");
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
