import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { markNotificationsRead } from "@/app/actions/time";
import { fdt } from "@/lib/util";

export default async function Notifications() {
  const u = await requireUser();
  const rows = await sql()`select * from notifications where employee_id = ${u.id} order by created_at desc limit 100`;
  return (
    <>
      <div className="head">
        <h1>การแจ้งเตือน</h1>
        <form action={markNotificationsRead}>
          <button className="btn">อ่านทั้งหมดแล้ว</button>
        </form>
      </div>
      <div className="card">
        {rows.length === 0 ? <div className="empty">ไม่มีการแจ้งเตือน</div> : null}
        <div className="feed">
          {rows.map((n: any) => (
            <div key={n.id} className="post" style={{ opacity: n.read_at ? 0.65 : 1 }}>
              <b>{n.link ? <Link href={n.link}>{n.title}</Link> : n.title}</b>
              {n.body ? <div className="small">{n.body}</div> : null}
              <div className="small muted">{fdt(n.created_at)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
