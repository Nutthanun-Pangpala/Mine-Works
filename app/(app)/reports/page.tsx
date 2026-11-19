import Link from "next/link";
import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { computeAttendance, summarize } from "@/lib/attendance";
import { REPORTS, REPORT_GROUPS, reportScope } from "@/lib/reports";
import { EMP_STATUS, fd, money, todayBkk, yearsOfService } from "@/lib/util";
import Tabs from "@/components/Tabs";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const dash = can(u, "dashboard");
  const tab = sp.tab === "dashboard" && dash ? "dashboard" : "reports";
  const allowed = [];
  for (const r of REPORTS) if ((await reportScope(u, r)) !== false) allowed.push(r);
  if (!allowed.length && !dash) redirect("/?error=forbidden");
  const group = sp.group && REPORT_GROUPS[sp.group] ? String(sp.group) : "";

  return (
    <>
      <div className="head">
        <h1>รายงาน</h1>
      </div>
      <Tabs
        tabs={[
          { href: "/reports", label: "รายงาน", on: tab === "reports" },
          { href: "/reports?tab=dashboard", label: "แดชบอร์ด", on: tab === "dashboard", hidden: !dash },
          { href: "/reports/orgchart", label: "แผนผังองค์กร" },
        ]}
      />
      {tab === "dashboard" ? (
        <Dashboard payroll={can(u, "payroll")} />
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <Link className={"chip-link" + (!group ? " on" : "")} href="/reports">
              ทั้งหมด
            </Link>
            {Object.entries(REPORT_GROUPS).map(([k, v]) =>
              allowed.some((r) => r.group === k) ? (
                <Link key={k} className={"chip-link" + (group === k ? " on" : "")} href={`/reports?group=${k}`}>
                  {v}
                </Link>
              ) : null,
            )}
          </div>
          {Object.entries(REPORT_GROUPS)
            .filter(([k]) => !group || group === k)
            .map(([k, v]) => {
              const list = allowed.filter((r) => r.group === k);
              if (!list.length) return null;
              return (
                <div className="card" key={k}>
                  <h2>{v}</h2>
                  <table className="tbl compact">
                    <tbody>
                      {list.map((r) => (
                        <tr key={r.code}>
                          <td style={{ width: 90 }}>
                            <b>{r.code}</b>
                          </td>
                          <td>
                            <Link href={`/reports/${r.code}`}>{r.name}</Link>
                          </td>
                          <td className="small muted">
                            {r.params.includes("range") ? "ช่วงวันที่" : r.params.includes("month") ? "รายเดือน" : r.params.includes("year") ? "รายปี" : r.params.includes("period") ? "รายงวด" : "ปัจจุบัน"}
                          </td>
                          <td className="num">
                            <a className="small" href={`/api/reports/${r.code}`}>
                              CSV
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
        </>
      )}
    </>
  );
}

function Bars({ data }: { data: { label: string; value: number; text?: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d) => (
        <div key={d.label} className="bar-row">
          <span className="lbl">{d.label}</span>
          <span className="track">
            <i style={{ width: `${(d.value / max) * 100}%` }} />
          </span>
          <span className="val">{d.text ?? d.value}</span>
        </div>
      ))}
    </div>
  );
}

async function Dashboard({ payroll }: { payroll: boolean }) {
  const today = todayBkk();
  const ym = today.slice(0, 7);
  const [emps, byUnit, pending, periods] = await Promise.all([
    sql()`select id, status, gender, start_date::text as sd, end_date::text as ed, birth_date::text as bd, company_id from employees where status <> 'pending'`,
    sql()`select coalesce(ou.name, 'ไม่ระบุ') as unit, count(*)::int as n from employees e left join org_units ou on ou.id = e.org_unit_id
          where e.status in ('probation','confirmed') group by 1 order by 2 desc limit 10`,
    sql()`select doc_type, count(*)::int as n from requests where status = 'pending' group by 1 order by 2 desc`,
    payroll
      ? sql()`select p.name, p.pay_date::text as pd, coalesce(sum(l.gross),0) as gross, coalesce(sum(l.net),0) as net,
                     coalesce(sum(l.sso_employer + l.pf_employer + l.ewf_employer),0) as er, count(l.id)::int as n
              from payroll_periods p left join payroll_lines l on l.period_id = p.id where p.status <> 'draft'
              group by p.id order by p.pay_date desc limit 6`
      : Promise.resolve([]),
  ]);
  const active = emps.filter((e: any) => e.status !== "terminated");
  const newIn = emps.filter((e: any) => e.sd && e.sd.startsWith(ym)).length;
  const left = emps.filter((e: any) => e.ed && e.ed.startsWith(ym)).length;
  const avgTenure = active.length ? active.reduce((a: number, e: any) => a + yearsOfService(e.sd), 0) / active.length : 0;
  const ages = [0, 0, 0, 0, 0];
  for (const e of active) {
    if (!e.bd) continue;
    const a = Number(today.slice(0, 4)) - Number(e.bd.slice(0, 4));
    ages[a < 25 ? 0 : a < 35 ? 1 : a < 45 ? 2 : a < 55 ? 3 : 4]++;
  }
  const att = await computeAttendance(active.map((e: any) => e.id), today, today);
  let present = 0, late = 0, leave = 0, absentSoFar = 0, work = 0;
  for (const days of att.values()) {
    const d = days[0];
    if (!d || d.kind !== "work") continue;
    work++;
    const s = summarize(days);
    if (d.in_ms !== null) present++;
    if (s.late_count) late++;
    if (d.leave_days > 0) leave++;
    if (d.in_ms === null && !d.leave_days && !d.offsite) absentSoFar++;
  }
  const DT: Record<string, string> = { leave: "ลางาน", ot: "OT", certify: "รับรองเวลา", offsite: "นอกสถานที่", welfare: "สวัสดิการ", expense: "เบิกค่าใช้จ่าย", doc: "ขอเอกสาร", action: "การดำเนินการ", warning: "หนังสือเตือน", swap: "แลกเวลา", change_shift: "เปลี่ยนกะ", swap_shift: "สลับกะ", accumulate: "สะสมเวลา" };
  return (
    <>
      <div className="card">
        <h2>บุคลากร</h2>
        <div className="kpi">
          <div><b>{active.length}</b><span>พนักงานปัจจุบัน</span></div>
          <div><b>{active.filter((e: any) => e.status === "probation").length}</b><span>{EMP_STATUS.probation}</span></div>
          <div><b>{newIn}</b><span>เข้าใหม่เดือนนี้</span></div>
          <div><b>{left}</b><span>พ้นสภาพเดือนนี้</span></div>
          <div><b>{avgTenure.toFixed(1)}</b><span>อายุงานเฉลี่ย (ปี)</span></div>
          <div><b>{active.filter((e: any) => e.gender === "male").length}/{active.filter((e: any) => e.gender === "female").length}</b><span>ชาย/หญิง</span></div>
        </div>
        <div className="cols" style={{ marginTop: 14 }}>
          <div>
            <h3>จำนวนพนักงานตามหน่วยงาน</h3>
            <Bars data={byUnit.map((r: any) => ({ label: r.unit, value: r.n }))} />
          </div>
          <div>
            <h3>ช่วงอายุ</h3>
            <Bars data={["< 25", "25-34", "35-44", "45-54", "55+"].map((l, i) => ({ label: l, value: ages[i] }))} />
          </div>
        </div>
      </div>
      <div className="card">
        <h2>เวลาทำงานวันนี้ ({fd(today)})</h2>
        <div className="kpi">
          <div><b>{present}/{work}</b><span>มาทำงาน</span></div>
          <div><b>{late}</b><span>มาสาย</span></div>
          <div><b>{leave}</b><span>ลา</span></div>
          <div><b>{absentSoFar}</b><span>ยังไม่ทาบเข้า</span></div>
        </div>
        <h3 style={{ marginTop: 14 }}>เอกสารรออนุมัติ</h3>
        {pending.length ? <Bars data={pending.map((r: any) => ({ label: DT[r.doc_type] || r.doc_type, value: r.n }))} /> : <div className="empty">ไม่มี</div>}
      </div>
      {payroll && (
        <div className="card">
          <h2>เงินเดือน (6 งวดล่าสุด)</h2>
          {periods.length ? (
            <Bars data={[...periods].reverse().map((p: any) => ({ label: p.name, value: Number(p.gross) + Number(p.er), text: `${money(Number(p.gross) + Number(p.er), 0)} (${p.n} คน)` }))} />
          ) : (
            <div className="empty">ยังไม่มีงวดที่คำนวณ</div>
          )}
          <p className="small muted">ต้นทุนนายจ้าง = รายได้รวม + ประกันสังคม/กองทุนส่วนนายจ้าง</p>
        </div>
      )}
    </>
  );
}
