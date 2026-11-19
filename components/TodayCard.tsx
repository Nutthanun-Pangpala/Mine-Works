import { sql } from "@/lib/db";
import { todayBkk, TZ } from "@/lib/util";
import { checkIn, checkOut } from "@/app/actions";
import CheckInButton from "./CheckInButton";

export default async function TodayCard({ userId }: { userId: number }) {
  const rows = await sql()`
    select to_char(a.check_in at time zone 'Asia/Bangkok', 'HH24:MI') as cin,
           to_char(a.check_out at time zone 'Asia/Bangkok', 'HH24:MI') as cout,
           a.late_minutes, a.in_distance_m, b.radius_m
    from attendance a
    join employees e on e.id = a.employee_id
    left join branches b on b.id = e.branch_id
    where a.employee_id = ${userId} and a.work_date = ${todayBkk()}::date`;
  const a = rows[0];
  const dateText = new Intl.DateTimeFormat("th-TH", { dateStyle: "full", timeZone: TZ }).format(new Date());
  const outside = a && a.in_distance_m != null && a.radius_m != null && a.in_distance_m > a.radius_m;

  return (
    <section className="card today">
      <div>
        <div className="muted small">{dateText}</div>
        <div className="times">
          <div>
            <span className="muted small">เข้างาน</span>
            <b>{a?.cin || "–"}</b>
          </div>
          <div>
            <span className="muted small">ออกงาน</span>
            <b>{a?.cout || "–"}</b>
          </div>
        </div>
        {a && a.late_minutes > 0 && <span className="badge late">สาย {a.late_minutes} นาที</span>}{" "}
        {outside && <span className="badge pending">ลงเวลานอกพื้นที่ ({a.in_distance_m} ม.)</span>}
      </div>
      {!a ? (
        <CheckInButton key="in" action={checkIn} label="ลงเวลาเข้างาน" />
      ) : (
        <CheckInButton key="out" action={checkOut} label={a.cout ? "ลงเวลาออกงานอีกครั้ง" : "ลงเวลาออกงาน"} />
      )}
    </section>
  );
}
