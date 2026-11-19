import { isHR, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isDate, isMonth, monthBkk, todayBkk } from "@/lib/util";
import Notice from "@/components/Notice";
import TodayCard from "@/components/TodayCard";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const hr = isHR(u);
  const m = isMonth(sp.m) ? sp.m : monthBkk();
  const d = isDate(sp.d) ? sp.d : todayBkk();

  const mine = await sql()`
    select to_char(work_date, 'DD/MM/YYYY') as day,
           to_char(check_in at time zone 'Asia/Bangkok', 'HH24:MI') as cin,
           to_char(check_out at time zone 'Asia/Bangkok', 'HH24:MI') as cout,
           late_minutes,
           round((extract(epoch from (check_out - check_in)) / 3600.0)::numeric, 1)::float as hours
    from attendance
    where employee_id = ${u.id} and to_char(work_date, 'YYYY-MM') = ${m}
    order by work_date desc`;

  const team = await sql()`
    select e.id, e.code, e.first_name || ' ' || e.last_name as name, dp.name as dept,
           to_char(a.check_in at time zone 'Asia/Bangkok', 'HH24:MI') as cin,
           to_char(a.check_out at time zone 'Asia/Bangkok', 'HH24:MI') as cout,
           a.late_minutes, a.in_distance_m, b.radius_m,
           (select lt.name from leave_requests lr join leave_types lt on lt.id = lr.leave_type_id
             where lr.employee_id = e.id and lr.status = 'approved'
               and ${d}::date between lr.start_date and lr.end_date limit 1) as leave_name
    from employees e
    left join departments dp on dp.id = e.department_id
    left join branches b on b.id = e.branch_id
    left join attendance a on a.employee_id = e.id and a.work_date = ${d}::date
    where e.status = 'active' and (${hr}::boolean or e.manager_id = ${u.id})
    order by e.code`;

  return (
    <>
      <div className="head">
        <h1>ลงเวลา</h1>
      </div>
      <Notice sp={sp} />
      <TodayCard userId={u.id} />

      {team.length > 0 && (
        <section className="card">
          <div className="head" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>{hr ? "การลงเวลาของพนักงานทั้งหมด" : "การลงเวลาของทีม"}</h2>
            <form className="inline" method="get">
              <input type="hidden" name="m" value={m} />
              <input type="date" name="d" defaultValue={d} />
              <button className="btn" type="submit">
                ดู
              </button>
            </form>
          </div>
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>ชื่อ</th>
                  <th>แผนก</th>
                  <th>เข้า</th>
                  <th>ออก</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {team.map((r: any) => {
                  const outside = r.in_distance_m != null && r.radius_m != null && r.in_distance_m > r.radius_m;
                  return (
                    <tr key={r.id}>
                      <td>{r.code}</td>
                      <td>{r.name}</td>
                      <td>{r.dept || "–"}</td>
                      <td>{r.cin || "–"}</td>
                      <td>{r.cout || "–"}</td>
                      <td>
                        {r.leave_name ? (
                          <span className="badge pending">{r.leave_name}</span>
                        ) : !r.cin ? (
                          <span className="badge">ยังไม่ลงเวลา</span>
                        ) : r.late_minutes > 0 ? (
                          <span className="badge late">สาย {r.late_minutes} นาที</span>
                        ) : (
                          <span className="badge approved">ตรงเวลา</span>
                        )}{" "}
                        {outside && <span className="badge pending">นอกพื้นที่ {r.in_distance_m} ม.</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <div className="head" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>ประวัติการลงเวลาของฉัน</h2>
          <form className="inline" method="get">
            <input type="hidden" name="d" value={d} />
            <input type="month" name="m" defaultValue={m} />
            <button className="btn" type="submit">
              ดู
            </button>
          </form>
        </div>
        <div className="scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>เข้า</th>
                <th>ออก</th>
                <th>ชั่วโมง</th>
                <th>สาย</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((r: any) => (
                <tr key={r.day}>
                  <td>{r.day}</td>
                  <td>{r.cin}</td>
                  <td>{r.cout || "–"}</td>
                  <td>{r.hours ?? "–"}</td>
                  <td>{r.late_minutes > 0 ? <span className="badge late">{r.late_minutes} นาที</span> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mine.length === 0 && <div className="empty">ยังไม่มีข้อมูลในเดือนนี้</div>}
      </section>
    </>
  );
}
