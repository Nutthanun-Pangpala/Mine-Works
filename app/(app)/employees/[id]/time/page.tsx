import { sql } from "@/lib/db";
import { loadProfile } from "@/lib/profile";
import { computeAttendance, dayLabel, summarize } from "@/lib/attendance";
import { leaveYear, quotasFor } from "@/lib/leave";
import { conditionsOf } from "@/lib/settings";
import { saveLeaveOverride } from "@/app/actions/employees";
import { TH_DOW, addMonths, d2, daysInMonth, ftime, isMonth, minutesText, monthBkk, num, thMonth, weekday, todayBkk } from "@/lib/util";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";

export default async function TimeTab({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { e, canEdit } = await loadProfile(id);
  const tab = sp.tab === "quota" ? "quota" : sp.tab === "reports" ? "reports" : "calendar";
  const ym = isMonth(sp.m) ? sp.m : monthBkk();
  const [y, m] = ym.split("-").map(Number);
  const from = `${ym}-01`;
  const to = `${ym}-${d2(daysInMonth(y, m))}`;
  const base = `/employees/${e.id}/time`;
  const company = (await sql()`select conditions from companies where id = ${e.company_id}`)[0];
  const yr = leaveYear(todayBkk(), conditionsOf(company).annual_cutoff);

  return (
    <>
      <Notice sp={sp} />
      <Tabs
        small
        tabs={[
          { href: base, label: "ปฏิทินการเข้างาน / เวลาทาบบัตร", on: tab === "calendar" },
          { href: `${base}?tab=quota`, label: "สิทธิ์การลา", on: tab === "quota" },
          { href: `${base}?tab=reports`, label: "รายงานประจำวัน", on: tab === "reports" },
        ]}
      />
      {tab === "calendar" && <Calendar e={e} ym={ym} from={from} to={to} base={base} y={y} m={m} />}
      {tab === "quota" && <Quota e={e} canEdit={canEdit} year={yr.year} />}
      {tab === "reports" && <Reports e={e} />}
    </>
  );
}

async function Calendar({ e, ym, from, to, base, y, m }: any) {
  const att = await computeAttendance([e.id], from, to);
  const days = att.get(e.id) || [];
  const s = summarize(days);
  const lead = (weekday(from) + 6) % 7;
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <a className="btn sm" href={`${base}?m=${addMonths(ym, -1)}`}>
          ‹
        </a>
        <b>
          {thMonth(m)} {y + 543}
        </b>
        <a className="btn sm" href={`${base}?m=${addMonths(ym, 1)}`}>
          ›
        </a>
        <span className="spacer" />
        <span className="small muted">
          ทำงาน {s.present_days}/{s.work_days} วัน · ขาด {s.absent_days} · สาย {s.late_count} ครั้ง ({s.late_min} นาที) · ลา {s.leave_days} วัน · ทำงานรวม{" "}
          {minutesText(s.worked_min)}
        </span>
      </div>
      <div className="cal">
        {["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."].map((d) => (
          <div key={d} className="h">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={"x" + i} />
        ))}
        {days.map((d) => {
          const l = dayLabel(d);
          return (
            <div key={d.date} className={`d ${d.kind}`}>
              <b>{Number(d.date.slice(8))}</b> <span className="muted">{TH_DOW[weekday(d.date)]}</span>
              {d.shift && d.kind === "work" ? <div>{d.shift.code}</div> : null}
              {d.in_ms || d.out_ms ? (
                <div>
                  {d.in_ms ? ftime(d.in_ms) : "--"}–{d.out_ms ? ftime(d.out_ms) : "--"}
                </div>
              ) : null}
              {l.text !== "-" && l.text !== "ปกติ" ? <div className={`badge ${l.cls}`}>{l.text}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function Quota({ e, canEdit, year }: any) {
  const quotas = await quotasFor(e.id);
  return (
    <div className="card">
      <h2>สิทธิ์การลา ปี {year + 543}</h2>
      <table className="tbl compact">
        <thead>
          <tr>
            <th>ประเภท</th>
            <th className="num">สิทธิ์</th>
            <th className="num">ยกมา</th>
            <th className="num">ใช้ไป</th>
            <th className="num">รออนุมัติ</th>
            <th className="num">คงเหลือ</th>
            {canEdit && <th>กำหนดสิทธิ์เอง (วัน)</th>}
          </tr>
        </thead>
        <tbody>
          {quotas.map((q) => (
            <tr key={q.type_id}>
              <td>{q.name}</td>
              <td className="num">{q.entitled === null ? "ไม่จำกัด" : num(q.entitled, 2)}</td>
              <td className="num">{num(q.carried, 2)}</td>
              <td className="num">{num(q.used, 2)}</td>
              <td className="num">{num(q.pending, 2)}</td>
              <td className="num">{q.remaining === null ? "-" : num(q.remaining, 2)}</td>
              {canEdit && (
                <td>
                  <form action={saveLeaveOverride} className="inline">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="leave_type_id" value={q.type_id} />
                    <input type="hidden" name="year" value={year} />
                    <input name="days" type="number" step="0.5" style={{ width: 80 }} placeholder="อัตโนมัติ" />
                    <button className="btn sm">บันทึก</button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">เว้นว่างแล้วบันทึกเพื่อกลับไปใช้สิทธิ์ตามเงื่อนไขประเภทการลา</p>
    </div>
  );
}

async function Reports({ e }: any) {
  const rows = await sql()`select report_date::text as d, mood, body from daily_reports where employee_id = ${e.id} order by report_date desc limit 60`;
  return (
    <div className="card">
      <h2>รายงานประจำวัน</h2>
      {rows.length === 0 ? <div className="empty">ไม่มีข้อมูล</div> : null}
      <table className="tbl compact">
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.d}>
              <td>{r.d}</td>
              <td>{r.mood ? "★".repeat(r.mood) : ""}</td>
              <td className="wrap">{r.body}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
