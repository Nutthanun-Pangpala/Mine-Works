import Link from "next/link";
import { isHR, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { todayBkk } from "@/lib/util";
import Notice from "@/components/Notice";
import TodayCard from "@/components/TodayCard";

export default async function Dashboard({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const hr = isHR(u);
  const today = todayBkk();

  const balances = await sql()`
    select lt.name, lt.days_per_year::float as quota,
      coalesce((select sum(lr.days) from leave_requests lr
        where lr.leave_type_id = lt.id and lr.employee_id = ${u.id} and lr.status in ('approved','pending')
          and extract(year from lr.start_date) = extract(year from ${today}::date)), 0)::float as used
    from leave_types lt order by lt.id`;

  const waiting = (
    await sql()`
      select
        (select count(*) from leave_requests lr join employees e on e.id = lr.employee_id
          where lr.status = 'pending' and lr.employee_id <> ${u.id} and (${hr}::boolean or e.manager_id = ${u.id}))::int as leave,
        (select count(*) from ot_requests o join employees e on e.id = o.employee_id
          where o.status = 'pending' and o.employee_id <> ${u.id} and (${hr}::boolean or e.manager_id = ${u.id}))::int as ot`
  )[0];

  let stats: any = null;
  let depts: any[] = [];
  if (hr) {
    stats = (
      await sql()`
        select
          (select count(*) from employees where status = 'active')::int as headcount,
          (select count(*) from attendance where work_date = ${today}::date)::int as present,
          (select count(*) from attendance where work_date = ${today}::date and late_minutes > 0)::int as late,
          (select count(*) from leave_requests where status = 'approved' and ${today}::date between start_date and end_date)::int as on_leave`
    )[0];
    depts = await sql()`
      select coalesce(d.name, 'ไม่ระบุแผนก') as name, count(*)::int as n
      from employees e left join departments d on d.id = e.department_id
      where e.status = 'active' group by 1 order by n desc, 1`;
  }
  const max = depts.reduce((m, d) => Math.max(m, d.n), 1);

  return (
    <>
      <div className="head">
        <div>
          <h1>สวัสดี {u.first_name}</h1>
          <div className="muted">ภาพรวมวันนี้</div>
        </div>
      </div>
      <Notice sp={sp} />
      <TodayCard userId={u.id} />

      {(waiting.leave > 0 || waiting.ot > 0) && (
        <div className="notice ok">
          มีรายการรออนุมัติ: <Link href="/leave">ใบลา {waiting.leave} รายการ</Link> ·{" "}
          <Link href="/ot">OT {waiting.ot} รายการ</Link>
        </div>
      )}

      {stats && (
        <div className="grid">
          <div className="stat">
            <b>{stats.headcount}</b>
            <span>พนักงานทั้งหมด</span>
          </div>
          <div className="stat">
            <b>{stats.present}</b>
            <span>ลงเวลาแล้ววันนี้</span>
          </div>
          <div className="stat">
            <b>{stats.late}</b>
            <span>มาสายวันนี้</span>
          </div>
          <div className="stat">
            <b>{stats.on_leave}</b>
            <span>ลาวันนี้</span>
          </div>
        </div>
      )}

      <div className="cols">
        <section className="card">
          <h2>วันลาคงเหลือของฉัน</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>ประเภท</th>
                <th>ใช้ไป</th>
                <th>คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b: any) => (
                <tr key={b.name}>
                  <td>{b.name}</td>
                  <td>
                    {b.used} / {b.quota} วัน
                  </td>
                  <td>{b.quota - b.used} วัน</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {hr && (
          <section className="card">
            <h2>จำนวนพนักงานตามแผนก</h2>
            <table className="tbl">
              <tbody>
                {depts.map((d: any) => (
                  <tr key={d.name}>
                    <td>{d.name}</td>
                    <td>{d.n} คน</td>
                    <td style={{ width: "45%" }}>
                      <div className="bar">
                        <i style={{ width: `${(d.n / max) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </>
  );
}
