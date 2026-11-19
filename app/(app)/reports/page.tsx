import { redirect } from "next/navigation";
import { isHR, requireUser } from "@/lib/auth";
import { isMonth, monthBkk } from "@/lib/util";
import { monthlySummary } from "@/lib/reports";

const EXPORTS = [
  { type: "summary", label: "สรุปรายเดือน (ใช้ทำเงินเดือน)" },
  { type: "attendance", label: "การลงเวลา" },
  { type: "leave", label: "ใบลา" },
  { type: "ot", label: "OT" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  if (!isHR(u)) redirect("/");
  const m = isMonth(sp.m) ? sp.m : monthBkk();
  const rows = await monthlySummary(m);

  return (
    <>
      <div className="head">
        <div>
          <h1>รายงาน</h1>
          <div className="muted">ดาวน์โหลดเป็นไฟล์ CSV เปิดด้วย Excel ได้</div>
        </div>
        <form className="inline" method="get">
          <input type="month" name="m" defaultValue={m} />
          <button className="btn" type="submit">
            เปลี่ยนเดือน
          </button>
        </form>
      </div>

      <section className="card">
        <h2>ดาวน์โหลดรายงานเดือน {m}</h2>
        <div className="actions" style={{ flexWrap: "wrap" }}>
          {EXPORTS.map((x) => (
            <a key={x.type} className="btn" href={`/api/export/${x.type}?m=${m}`}>
              {x.label}
            </a>
          ))}
          <a className="btn" href="/api/export/employees">
            ทะเบียนพนักงาน
          </a>
        </div>
      </section>

      <section className="card">
        <h2>สรุปรายเดือน {m}</h2>
        <div className="scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่อ</th>
                <th>แผนก</th>
                <th>วันมาทำงาน</th>
                <th>สาย (ครั้ง)</th>
                <th>สาย (นาที)</th>
                <th>ลา (วัน)</th>
                <th>OT (ชม.)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.code}>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td>{r.dept || "–"}</td>
                  <td>{r.days_present}</td>
                  <td>{r.late_count}</td>
                  <td>{r.late_minutes}</td>
                  <td>{r.leave_days}</td>
                  <td>{r.ot_hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
