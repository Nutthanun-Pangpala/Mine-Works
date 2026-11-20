import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { computeAttendance, dayLabel } from "@/lib/attendance";
import { shiftsList } from "@/lib/lookups";
import { teamMembers } from "@/lib/team";
import { assignShifts } from "@/app/actions/team";
import { TH_DOW, addDays, fd, fullName, isDate, todayBkk, weekday } from "@/lib/util";
import Notice from "@/components/Notice";

export default async function Schedule({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const base = isDate(sp.week) ? sp.week : todayBkk();
  const start = addDays(base, -((weekday(base) + 6) % 7)); // Monday
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const members = await teamMembers(u);
  const [att, shifts] = await Promise.all([computeAttendance(members.map((m) => m.id), days[0], days[6]), shiftsList()]);
  const manage = can(u, "team", "create");
  return (
    <>
      <Notice sp={sp} />
      <div className="row" style={{ marginBottom: 12 }}>
        <Link className="btn sm" href={`/team/schedule?week=${addDays(start, -7)}`}>
          ‹ สัปดาห์ก่อน
        </Link>
        <b>
          {fd(days[0])} – {fd(days[6])}
        </b>
        <Link className="btn sm" href={`/team/schedule?week=${addDays(start, 7)}`}>
          สัปดาห์ถัดไป ›
        </Link>
        <Link className="btn sm" href="/team/schedule">
          วันนี้
        </Link>
      </div>
      <div className="card scroll">
        <table className="tbl compact">
          <thead>
            <tr>
              <th>รายชื่อ</th>
              {days.map((d) => (
                <th key={d}>
                  {TH_DOW[weekday(d)]} {Number(d.slice(8))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  {fullName(m)}
                  <div className="small muted">{m.position || ""}</div>
                </td>
                {(att.get(m.id) || []).map((d) => {
                  const l = dayLabel(d);
                  return (
                    <td key={d.date} className="small">
                      {d.shift && d.kind === "work" ? (
                        <span className="chip" style={{ background: d.shift.color || "#0f5f5c" }}>
                          {d.shift.code} {d.shift.start}
                        </span>
                      ) : (
                        <span className="muted">{d.kind === "holiday" ? "หยุดนักขัตฯ" : d.kind === "off" ? "หยุด" : "-"}</span>
                      )}
                      {l.cls && l.cls !== "off" && l.cls !== "holiday" ? <div>{l.text}</div> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {manage && members.length > 0 && (
        <div className="card">
          <h2>จัดการกะ</h2>
          <form action={assignShifts} className="fields">
            <input type="hidden" name="back" value={`/team/schedule?week=${start}`} />
            <label className="full">
              พนักงาน (เลือกได้หลายคน)
              <select name="employee_ids" multiple size={Math.min(8, members.length)} required>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} {fullName(m)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ตั้งแต่วันที่
              <input type="date" name="from" required defaultValue={days[0]} />
            </label>
            <label>
              ถึงวันที่
              <input type="date" name="to" required defaultValue={days[6]} />
            </label>
            <label>
              กะ
              <select name="shift_id">
                <option value="default">ใช้กะตั้งต้นของพนักงาน</option>
                <option value="off">วันหยุด</option>
                {shifts.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.code} {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn primary">บันทึก</button>
          </form>
        </div>
      )}
    </>
  );
}
