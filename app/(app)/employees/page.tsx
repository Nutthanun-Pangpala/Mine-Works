import Link from "next/link";
import { can, requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies, units } from "@/lib/lookups";
import { EMP_STATUS, fd, fullName, tenureText, todayBkk } from "@/lib/util";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";
import Badge from "@/components/Badge";

export default async function Employees({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requirePerm("employees");
  const status = EMP_STATUS[sp.status] ? sp.status : "";
  const qtext = String(sp.q || "").trim();
  const unit = Number(sp.unit) || null;
  const company = Number(sp.company) || null;
  const quick = String(sp.quick || "");
  const today = todayBkk();

  const [rows, counts, cos, uns] = await Promise.all([
    sql().query(
      `select e.id, e.code, e.first_name, e.last_name, e.nickname, e.status, e.start_date::text as sd, e.end_date::text as ed,
              p.name as position, l.code as level, ou.name as unit, c.name_th as company, s.code as shift_code, s.name as shift_name,
              mo.name as etype, e.updated_at
       from employees e
       left join positions p on p.id = e.position_id left join position_levels l on l.id = p.level_id
       left join org_units ou on ou.id = e.org_unit_id left join companies c on c.id = e.company_id
       left join shifts s on s.id = e.shift_id left join master_options mo on mo.id = e.employee_type_id
       where ($1 = '' and e.status <> 'terminated' or e.status = $1)
         and ($2 = '' or e.code ilike $2 or e.first_name ilike $2 or e.last_name ilike $2 or coalesce(e.nickname,'') ilike $2 or coalesce(e.work_email,'') ilike $2)
         and ($3::int is null or e.org_unit_id = $3) and ($4::int is null or e.company_id = $4)
         and ($5 <> 'month' or e.start_date between date_trunc('month', $6::date) and $6::date + 31)
         and ($5 <> 'missing' or e.national_id is null or e.birth_date is null or e.bank_account is null)
         and ($5 <> 'probation_due' or (e.status = 'probation' and e.probation_end_date <= $6::date + 30))
       order by ${sp.sort === "recent" ? "e.updated_at desc" : "e.code"} limit 500`,
      [status, qtext ? `%${qtext}%` : "", unit, company, quick, today],
    ),
    sql()`select status, count(*)::int as n from employees group by status`,
    companies(),
    units(),
  ]);
  const cnt = (s: string) => counts.find((c: any) => c.status === s)?.n || 0;
  const base = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (qtext) p.set("q", qtext);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    return `/employees?${p.toString()}`;
  };

  return (
    <>
      <div className="head">
        <h1>บริหารข้อมูลพนักงาน</h1>
        <div className="row">
          {can(u, "employees.export") && (
            <a className="btn" href="/api/reports/B014">
              ดาวน์โหลด Excel (CSV)
            </a>
          )}
          {can(u, "settings.system", "create") && (
            <Link className="btn" href="/settings/import">
              นำเข้าข้อมูล
            </Link>
          )}
          {can(u, "employees", "create") && (
            <Link className="btn primary" href="/employees/new">
              + เพิ่มพนักงาน
            </Link>
          )}
        </div>
      </div>
      <Notice sp={sp} />
      <Tabs
        tabs={[
          { href: base({}), label: "ทั้งหมด", on: !status, count: cnt("pending") + cnt("probation") + cnt("confirmed") },
          { href: base({ status: "pending" }), label: "รอเริ่มงาน", on: status === "pending", count: cnt("pending") },
          { href: base({ status: "probation" }), label: "ทดลองงาน", on: status === "probation", count: cnt("probation") },
          { href: base({ status: "confirmed" }), label: "บรรจุ", on: status === "confirmed", count: cnt("confirmed") },
          { href: base({ status: "terminated" }), label: "พ้นสภาพ", on: status === "terminated", count: cnt("terminated") },
        ]}
      />
      <form className="inline" style={{ marginBottom: 12 }}>
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" placeholder="ค้นหาชื่อ รหัส อีเมล" defaultValue={qtext} />
        <select name="company" defaultValue={company ?? ""}>
          <option value="">ทุกบริษัท</option>
          {cos.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name_th}
            </option>
          ))}
        </select>
        <select name="unit" defaultValue={unit ?? ""}>
          <option value="">ทุกสังกัด</option>
          {uns.map((x: any) => (
            <option key={x.id} value={x.id}>
              {x.path}
            </option>
          ))}
        </select>
        <select name="quick" defaultValue={quick}>
          <option value="">ตัวกรองด่วน</option>
          <option value="month">เริ่มงานภายในเดือนนี้</option>
          <option value="missing">รอเพิ่มข้อมูล</option>
          <option value="probation_due">ครบทดลองงานใน 30 วัน</option>
        </select>
        <select name="sort" defaultValue={sp.sort || ""}>
          <option value="">เรียงตามรหัส</option>
          <option value="recent">แก้ไขล่าสุด</option>
        </select>
        <button className="btn">ค้นหา</button>
      </form>
      <div className="card scroll">
        {rows.length === 0 ? <div className="empty">ไม่พบพนักงาน</div> : null}
        <table className="tbl">
          {rows.length > 0 && (
            <thead>
              <tr>
                <th>รหัส</th>
                <th>รายชื่อ</th>
                <th>ระดับ</th>
                <th>สังกัด</th>
                <th>กะการทำงาน</th>
                <th>วันที่เริ่มงาน</th>
                <th>ประเภท</th>
                <th>สถานะ</th>
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((e: any) => (
              <tr key={e.id}>
                <td>{e.code}</td>
                <td>
                  <Link href={`/employees/${e.id}`}>
                    {fullName(e)} {e.nickname ? `(${e.nickname})` : ""}
                  </Link>
                  <div className="small muted">{e.position || "-"}</div>
                </td>
                <td>{e.level || "-"}</td>
                <td>
                  {e.company}
                  <div className="small muted">{e.unit || ""}</div>
                </td>
                <td>{e.shift_name || "-"}</td>
                <td>
                  {fd(e.sd)}
                  <div className="small muted">{e.status === "terminated" ? `พ้นสภาพ ${fd(e.ed)}` : tenureText(e.sd)}</div>
                </td>
                <td>{e.etype || "-"}</td>
                <td>
                  <Badge status={e.status} label={EMP_STATUS[e.status]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
