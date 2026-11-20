import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { TH_DOW, fdt } from "@/lib/util";
import Notice from "@/components/Notice";

export default async function Shifts({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.time");
  const rows = await sql()`
    select s.*, c.name_th as company, u.first_name as uf,
      (select count(*)::int from employees e where e.shift_id = s.id and e.status <> 'terminated') as n
    from shifts s left join companies c on c.id = s.company_id left join employees u on u.id = s.updated_by order by s.code`;
  return (
    <>
      <Notice sp={sp} />
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>ตั้งค่ากะทำงาน</h2>
        <span className="spacer" />
        <Link className="btn primary" href="/settings/shifts/new">
          + เพิ่มกะการทำงาน
        </Link>
      </div>
      <div className="card scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>ชื่อกะ</th>
              <th>รหัสกะ</th>
              <th>เวลา</th>
              <th>วันทำงาน</th>
              <th>บริษัท</th>
              <th className="num">พนักงาน</th>
              <th>แก้ไขล่าสุด</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s: any) => (
              <tr key={s.id}>
                <td>
                  <span className="chip" style={{ background: s.color || "#0f5f5c" }}>
                    &nbsp;
                  </span>{" "}
                  <Link href={`/settings/shifts/${s.id}`}>{s.name}</Link>
                  <div className="small muted">{s.description}</div>
                </td>
                <td>{s.code}</td>
                <td>
                  {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                  {s.flexible ? <div className="small muted">ยืดหยุ่น {s.flex_minutes} นาที</div> : null}
                </td>
                <td>{(s.weekdays || []).map((d: number) => TH_DOW[d]).join(" ")}</td>
                <td>{s.company || "ใช้กับทุกบริษัท"}</td>
                <td className="num">{s.n}</td>
                <td className="small">
                  {s.uf || "ระบบ"} {fdt(s.updated_at)}
                </td>
                <td>{s.active ? "ใช้งาน" : "ปิด"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
