import Link from "next/link";
import { isHR, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const hr = isHR(u);
  const q = String(sp.q || "").trim();
  const like = `%${q}%`;
  const all = hr && sp.all === "1";

  const rows = await sql()`
    select e.id, e.code, e.first_name, e.last_name, e.nickname, e.email, e.phone, e.status,
           d.name as dept, p.name as pos, b.name as branch
    from employees e
    left join departments d on d.id = e.department_id
    left join positions p on p.id = e.position_id
    left join branches b on b.id = e.branch_id
    where (${q}::text = '' or e.first_name ilike ${like} or e.last_name ilike ${like}
           or e.code ilike ${like} or e.email ilike ${like} or e.nickname ilike ${like})
      and (${all}::boolean or e.status = 'active')
    order by e.code`;

  return (
    <>
      <div className="head">
        <div>
          <h1>พนักงาน</h1>
          <div className="muted">{rows.length} คน</div>
        </div>
        {hr && (
          <Link className="btn primary" href="/employees/new">
            + เพิ่มพนักงาน
          </Link>
        )}
      </div>
      <section className="card">
        <form className="inline" method="get" style={{ marginBottom: 12 }}>
          <input name="q" defaultValue={q} placeholder="ค้นหาชื่อ รหัส หรืออีเมล" />
          {hr && (
            <select name="all" defaultValue={all ? "1" : ""}>
              <option value="">เฉพาะที่ทำงานอยู่</option>
              <option value="1">ทั้งหมด</option>
            </select>
          )}
          <button className="btn" type="submit">
            ค้นหา
          </button>
        </form>
        <div className="scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่อ</th>
                <th>แผนก</th>
                <th>ตำแหน่ง</th>
                <th>สาขา</th>
                <th>อีเมล</th>
                <th>โทร</th>
                {hr && <th>สถานะ</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((e: any) => (
                <tr key={e.id}>
                  <td>{e.code}</td>
                  <td>
                    {hr || e.id === u.id ? (
                      <Link href={`/employees/${e.id}`}>
                        {e.first_name} {e.last_name}
                      </Link>
                    ) : (
                      `${e.first_name} ${e.last_name}`
                    )}
                    {e.nickname ? ` (${e.nickname})` : ""}
                  </td>
                  <td>{e.dept || "–"}</td>
                  <td>{e.pos || "–"}</td>
                  <td>{e.branch || "–"}</td>
                  <td>{e.email}</td>
                  <td>{e.phone || "–"}</td>
                  {hr && (
                    <td>
                      <span className={`badge ${e.status === "active" ? "active" : ""}`}>
                        {e.status === "active" ? "ทำงานอยู่" : "พ้นสภาพ"}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="empty">ไม่พบพนักงาน</div>}
      </section>
    </>
  );
}
