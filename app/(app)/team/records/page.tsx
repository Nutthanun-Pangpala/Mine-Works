import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { computeAttendance, dayLabel, summarize } from "@/lib/attendance";
import { teamMembers } from "@/lib/team";
import { TH_DOW, addDays, fd, ftime, fullName, isDate, minutesText, todayBkk, weekday } from "@/lib/util";
import Badge from "@/components/Badge";

export default async function Records({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const to = isDate(sp.to) ? sp.to : todayBkk();
  const from = isDate(sp.from) ? sp.from : addDays(to, -6);
  const members = await teamMembers(u, true);
  const emp = Number(sp.emp) || null;
  const list = emp ? members.filter((m) => m.id === emp) : members;
  const att = await computeAttendance(list.map((m) => m.id), from, to);
  return (
    <>
      <form className="inline" style={{ marginBottom: 12 }}>
        <label>
          ตั้งแต่
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          ถึง
          <input type="date" name="to" defaultValue={to} />
        </label>
        <label>
          พนักงาน
          <select name="emp" defaultValue={emp ?? ""}>
            <option value="">ทุกคน</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} {fullName(m)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn">ดู</button>
        <a className="btn" href={`/api/reports/C003?from=${from}&to=${to}`}>
          ดาวน์โหลด CSV
        </a>
      </form>
      <div className="card scroll">
        <h2>สรุปขาด ลา มาสาย</h2>
        <table className="tbl compact">
          <thead>
            <tr>
              <th>พนักงาน</th>
              <th className="num">วันทำงาน</th>
              <th className="num">มาทำงาน</th>
              <th className="num">ขาดงาน</th>
              <th className="num">สาย (ครั้ง/นาที)</th>
              <th className="num">กลับก่อน (ครั้ง/นาที)</th>
              <th className="num">ลืมลงเวลา</th>
              <th className="num">ลา (วัน)</th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => {
              const s = summarize(att.get(m.id) || []);
              return (
                <tr key={m.id}>
                  <td>
                    <Link href={`/team/records?from=${from}&to=${to}&emp=${m.id}`}>{fullName(m)}</Link>
                  </td>
                  <td className="num">{s.work_days}</td>
                  <td className="num">{s.present_days}</td>
                  <td className="num">{s.absent_days}</td>
                  <td className="num">
                    {s.late_count} / {s.late_min}
                  </td>
                  <td className="num">
                    {s.early_count} / {s.early_min}
                  </td>
                  <td className="num">{s.missing}</td>
                  <td className="num">{s.leave_days}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length <= 3 && (
        <div className="card scroll">
          <h2>รายวัน</h2>
          <table className="tbl compact">
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>วันที่</th>
                <th>กะ</th>
                <th>เข้า</th>
                <th>ออก</th>
                <th>ทำงาน</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {list.flatMap((m) =>
                (att.get(m.id) || []).map((d) => {
                  const l = dayLabel(d);
                  return (
                    <tr key={m.id + d.date}>
                      <td>{m.first_name}</td>
                      <td>
                        {TH_DOW[weekday(d.date)]} {fd(d.date)}
                      </td>
                      <td>{d.shift ? `${d.shift.code} ${d.shift.start}–${d.shift.end}` : "-"}</td>
                      <td>{d.in_ms ? ftime(d.in_ms) : "-"}</td>
                      <td>{d.out_ms ? ftime(d.out_ms) : "-"}</td>
                      <td>{d.worked_min ? minutesText(d.worked_min) : "-"}</td>
                      <td>{l.text !== "-" ? <Badge status={l.cls} label={l.text} /> : "-"}</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
