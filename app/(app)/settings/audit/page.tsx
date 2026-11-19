import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fdt } from "@/lib/util";

export default async function Audit({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("audit");
  const q = String(sp.q || "").trim();
  const rows = await sql()`
    select a.*, e.first_name, e.last_name from audit_logs a left join employees e on e.id = a.actor_id
    where (${q} = '' or a.action ilike ${"%" + q + "%"} or a.entity ilike ${"%" + q + "%"})
    order by a.created_at desc limit 300`;
  return (
    <>
      <form className="inline" style={{ marginBottom: 10 }}>
        <input name="q" placeholder="ค้นหา action / entity" defaultValue={q} />
        <button className="btn">ค้นหา</button>
      </form>
      <div className="card scroll">
        <table className="tbl compact">
          <thead>
            <tr>
              <th>เวลา</th>
              <th>ผู้ดำเนินการ</th>
              <th>การกระทำ</th>
              <th>ข้อมูล</th>
              <th>รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td>{fdt(r.created_at)}</td>
                <td>{r.first_name ? `${r.first_name} ${r.last_name}` : "ระบบ"}</td>
                <td>{r.action}</td>
                <td>
                  {r.entity} {r.entity_id ? `#${r.entity_id}` : ""}
                </td>
                <td className="wrap small">{r.detail ? JSON.stringify(r.detail) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
