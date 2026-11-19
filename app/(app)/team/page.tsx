import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { computeAttendance, dayLabel } from "@/lib/attendance";
import { teamMembers } from "@/lib/team";
import { fd, ftime, fullName, isDate, todayBkk } from "@/lib/util";
import Badge from "@/components/Badge";

export default async function TeamHome({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const date = isDate(sp.date) ? sp.date : todayBkk();
  const members = await teamMembers(u);
  const att = await computeAttendance(members.map((m) => m.id), date, date);
  const rows = members.map((m) => ({ m, d: att.get(m.id)?.[0] }));
  const c = {
    work: rows.filter((r) => r.d?.kind === "work").length,
    present: rows.filter((r) => r.d && (r.d.in_ms !== null || r.d.offsite)).length,
    notyet: rows.filter((r) => r.d?.kind === "work" && r.d.in_ms === null && !r.d.offsite && r.d.leave_days < 1 && !r.d.absent).length,
    leave: rows.filter((r) => (r.d?.leave_days || 0) > 0).length,
    offsite: rows.filter((r) => r.d?.offsite).length,
    late: rows.filter((r) => (r.d?.late_min || 0) > 0).length,
    early: rows.filter((r) => (r.d?.early_min || 0) > 0).length,
    absent: rows.filter((r) => r.d?.absent).length,
  };
  return (
    <>
      <form className="inline" style={{ marginBottom: 12 }}>
        <label>
          วันที่
          <input type="date" name="date" defaultValue={date} />
        </label>
        <button className="btn">ดู</button>
        <span className="muted">สรุปผลวันที่ {fd(date)} · สมาชิก {members.length} คน</span>
      </form>
      <div className="grid">
        <div className="stat"><b>{c.present}/{c.work}</b><span>มาทำงาน</span></div>
        <div className="stat"><b>{c.notyet}</b><span>ยังไม่มาทำงาน</span></div>
        <div className="stat"><b>{c.leave}</b><span>ลาหยุดงาน</span></div>
        <div className="stat"><b>{c.offsite}</b><span>นอกสถานที่</span></div>
        <div className="stat"><b>{c.late}</b><span>มาสาย</span></div>
        <div className="stat"><b>{c.early}</b><span>กลับก่อน</span></div>
        <div className="stat"><b>{c.absent}</b><span>ขาดงาน</span></div>
      </div>
      <div className="card scroll">
        {members.length === 0 ? <div className="empty">ยังไม่มีสมาชิกในทีม</div> : null}
        <table className="tbl">
          <thead>
            <tr>
              <th>พนักงาน</th>
              <th>สังกัด</th>
              <th>กะ</th>
              <th>เข้า</th>
              <th>ออก</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, d }) => {
              const l = d ? dayLabel(d) : { text: "-", cls: "" };
              return (
                <tr key={m.id}>
                  <td>
                    <Link href={`/employees/${m.id}`}>{fullName(m)}</Link>
                    <div className="small muted">
                      {m.code} · {m.position || "-"}
                    </div>
                  </td>
                  <td>{m.unit || "-"}</td>
                  <td>{d?.shift ? `${d.shift.code} ${d.shift.start}–${d.shift.end}` : d?.kind === "holiday" ? d.holiday : "-"}</td>
                  <td>{d?.in_ms ? ftime(d.in_ms) : "-"}</td>
                  <td>{d?.out_ms ? ftime(d.out_ms) : "-"}</td>
                  <td>{l.text !== "-" ? <Badge status={l.cls} label={l.text} /> : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
