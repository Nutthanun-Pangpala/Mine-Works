import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { computeAttendance, dayLabel } from "@/lib/attendance";
import { quotasFor } from "@/lib/leave";
import { getSettings } from "@/lib/settings";
import { clock, saveDailyReport } from "@/app/actions/time";
import { DOC_TYPES, REQ_STATUS, fd, fdLong, ftime, num, todayBkk, tenureText } from "@/lib/util";
import ClockButton from "@/components/ClockButton";
import Notice from "@/components/Notice";
import Badge from "@/components/Badge";

export default async function Home({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const today = todayBkk();
  const settings = await getSettings();
  const roleIds = u.roles.map((r) => r.id);

  const [att, quotas, myDocs, approvals, news, birthdays, newcomers, report, punches] = await Promise.all([
    computeAttendance([u.id], today, today),
    quotasFor(u.id, today),
    sql()`
      select r.id, r.doc_type, r.status, r.start_date::text as sd, r.end_date::text as ed, lt.name as sub
      from requests r left join leave_types lt on lt.id = r.sub_type_id
      where r.employee_id = ${u.id} order by r.created_at desc limit 5`,
    sql()`
      select count(distinct s.request_id)::int as n from request_steps s join requests r on r.id = s.request_id
      where s.status = 'pending' and r.status = 'pending' and (s.approver_id = ${u.id} or s.role_id = any(${roleIds}::int[]))`,
    sql()`
      select a.*, a.publish_at::text as pub, e.first_name, e.last_name from announcements a
      left join employees e on e.id = a.created_by
      where a.active and a.publish_at <= ${today} and (a.company_id is null or a.company_id = ${u.company_id})
      order by a.pinned desc, a.publish_at desc, a.id desc limit 10`,
    settings.org.show_birthday
      ? sql()`
          select id, first_name, last_name, nickname, birth_date::text as bd from employees
          where status <> 'terminated' and birth_date is not null and extract(month from birth_date) = extract(month from ${today}::date)
          order by extract(day from birth_date)`
      : Promise.resolve([]),
    sql()`
      select e.id, e.first_name, e.last_name, e.start_date::text as sd, p.name as position from employees e
      left join positions p on p.id = e.position_id
      where e.status <> 'terminated' and e.start_date between (${today}::date - 30) and ${today}::date order by e.start_date desc limit 8`,
    sql()`select body, mood from daily_reports where employee_id = ${u.id} and report_date = ${today}`,
    sql()`
      select ts, source from clock_records where employee_id = ${u.id}
        and ts >= (${today}::date)::timestamp at time zone 'Asia/Bangkok' order by ts`,
  ]);
  const day = att.get(u.id)?.[0];
  const label = day ? dayLabel(day) : null;

  return (
    <>
      <div className="head">
        <div>
          <h1>สวัสดี {u.nickname || u.first_name}</h1>
          <div className="muted">{fdLong(today)}</div>
        </div>
      </div>
      <Notice sp={sp} />

      <div className="card today">
        <div>
          <div className="muted small">วันนี้</div>
          <b>{day?.shift ? `${day.shift.name} (${day.shift.start}–${day.shift.end})` : day?.kind === "holiday" ? day.holiday : "ไม่มีกะทำงาน"}</b>
          <div className="small">{label && label.text !== "-" ? <Badge status={label.cls} label={label.text} /> : null}</div>
        </div>
        <div className="times">
          <div>
            <span className="muted small">เข้างาน</span>
            <b>{day?.in_ms ? ftime(day.in_ms) : "--:--"}</b>
          </div>
          <div>
            <span className="muted small">ออกงาน</span>
            <b>{day?.out_ms ? ftime(day.out_ms) : "--:--"}</b>
          </div>
        </div>
        <ClockButton action={clock} label={day?.in_ms ? "ลงเวลาออก" : "ลงเวลาเข้า"} />
      </div>

      <div className="cols">
        <div>
          <div className="card">
            <h2>นิวส์ฟีด</h2>
            {news.length === 0 && birthdays.length === 0 && newcomers.length === 0 ? <div className="empty">ยังไม่มีข่าวสาร</div> : null}
            <div className="feed">
              {news.map((n: any) => (
                <div className="post" key={n.id}>
                  <div className="row">
                    <b>{n.title}</b>
                    {n.pinned ? <span className="badge pending">ปักหมุด</span> : null}
                    <span className="badge">{n.kind === "policy" ? "นโยบาย" : "ข่าวสาร"}</span>
                  </div>
                  <div className="muted small">
                    {fd(n.pub)} {n.first_name ? `· ${n.first_name} ${n.last_name}` : ""}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
                </div>
              ))}
              {newcomers.length > 0 && (
                <div className="post">
                  <b>ยินดีต้อนรับพนักงานใหม่</b>
                  {newcomers.map((e: any) => (
                    <div key={e.id} className="small">
                      {e.first_name} {e.last_name} · {e.position || "-"} · เริ่มงาน {fd(e.sd)}
                    </div>
                  ))}
                </div>
              )}
              {birthdays.length > 0 && (
                <div className="post">
                  <b>วันเกิดเดือนนี้ 🎂</b>
                  {birthdays.map((e: any) => (
                    <div key={e.id} className="small">
                      {e.first_name} {e.last_name} {e.nickname ? `(${e.nickname})` : ""} · {Number(e.bd.slice(8, 10))}/{Number(e.bd.slice(5, 7))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div>
          {approvals[0].n > 0 && (
            <div className="card">
              <h2>รออนุมัติ</h2>
              <p>
                มีเอกสาร <b>{approvals[0].n}</b> รายการรอคุณอนุมัติ <Link href="/team/approvals">ไปที่หน้าอนุมัติ</Link>
              </p>
            </div>
          )}
          <div className="card">
            <h2>สิทธิ์การลาคงเหลือ</h2>
            <table className="tbl compact">
              <tbody>
                {quotas
                  .filter((q) => q.entitled !== null && (q.entitled > 0 || q.used > 0))
                  .map((q) => (
                    <tr key={q.type_id}>
                      <td>{q.name}</td>
                      <td className="num">
                        {num(q.remaining, 2)} / {num((q.entitled || 0) + q.carried, 2)} วัน
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 10 }}>
              <Link className="btn sm" href="/documents/new?type=leave">
                ขอลางาน
              </Link>
              <Link className="btn sm" href="/documents/new?type=ot">
                ขอ OT
              </Link>
              <Link className="btn sm" href="/documents/new?type=certify">
                รับรองเวลา
              </Link>
            </div>
          </div>
          <div className="card">
            <h2>เอกสารล่าสุดของฉัน</h2>
            {myDocs.length === 0 ? <div className="empty">ยังไม่มีเอกสาร</div> : null}
            <table className="tbl compact">
              <tbody>
                {myDocs.map((d: any) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/documents/${d.id}`}>{d.sub || DOC_TYPES[d.doc_type]}</Link>
                    </td>
                    <td>{d.sd ? fd(d.sd) : ""}</td>
                    <td>
                      <Badge status={d.status} label={REQ_STATUS[d.status]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>บันทึกเวลาวันนี้</h2>
            {punches.length === 0 ? <div className="empty">ยังไม่มีการลงเวลา</div> : null}
            {punches.map((p: any, i: number) => (
              <div key={i} className="small">
                {ftime(p.ts)} · {p.source}
              </div>
            ))}
            {settings.org.daily_report ? (
              <form action={saveDailyReport} className="fields" style={{ marginTop: 10 }}>
                <label className="full">
                  รายงานประจำวัน
                  <textarea name="body" rows={3} defaultValue={report[0]?.body ?? ""} />
                </label>
                <label>
                  อารมณ์วันนี้ (1–5)
                  <input type="number" name="mood" min={1} max={5} defaultValue={report[0]?.mood ?? ""} />
                </label>
                <button className="btn">บันทึก</button>
              </form>
            ) : null}
          </div>
          <p className="small muted">อายุงาน {tenureText(u.start_date)}</p>
        </div>
      </div>
    </>
  );
}
