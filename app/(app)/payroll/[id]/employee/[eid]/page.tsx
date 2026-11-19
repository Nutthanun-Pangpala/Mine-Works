import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PAY_TYPE, fd, fullName, money, num } from "@/lib/util";

export default async function PayrollEmployee({ params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id, eid } = await params;
  await requirePerm("payroll");
  const l = (
    await sql()`
      select l.*, p.name as period, p.start_date::text as sd, p.end_date::text as ed, p.status,
             e.code, e.title, e.first_name, e.last_name, e.salary, e.tax_method, e.bank_name, e.bank_account, e.payment_method,
             pos.name as position, ou.name as unit
      from payroll_lines l join payroll_periods p on p.id = l.period_id join employees e on e.id = l.employee_id
      left join positions pos on pos.id = e.position_id left join org_units ou on ou.id = e.org_unit_id
      where l.period_id = ${Number(id)} and l.employee_id = ${Number(eid)}`
  )[0];
  if (!l) notFound();
  const items = await sql()`
    select li.*, i.code, i.name, i.kind, i.tax_mode, i.in_sso from payroll_line_items li join pay_items i on i.id = li.pay_item_id
    where li.line_id = ${l.id} order by i.kind desc, i.sort, i.code`;
  const d = l.detail || {};
  const a = d.att || {};
  const inc = items.filter((i: any) => i.kind === "income");
  const ded = items.filter((i: any) => i.kind === "deduction");
  const SRC: Record<string, string> = { auto: "คำนวณ", manual: "ปรับปรุง", recurring: "ประจำ", claim: "เบิก", liability: "ภาระหนี้" };
  const list = (rows: any[]) => (
    <table className="tbl compact">
      <tbody>
        {rows.map((i: any) => (
          <tr key={i.id}>
            <td>
              {i.code} {i.name}
              {i.note ? <div className="small muted">{typeof i.note === "string" ? i.note : ""}</div> : null}
            </td>
            <td className="small muted">{SRC[i.source] || i.source}</td>
            <td className="num">{i.qty != null ? num(i.qty, 2) : ""}</td>
            <td className="num">{money(i.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <>
      <div className="head">
        <div>
          <h1>
            {l.code} {fullName(l)}
          </h1>
          <div className="muted">
            {l.position || ""} {l.unit ? `· ${l.unit}` : ""} · {l.period} ({fd(l.sd)} – {fd(l.ed)})
          </div>
        </div>
        <div className="row">
          <Link className="btn" href={`/print/payslip/${l.id}`} target="_blank">
            สลิปเงินเดือน
          </Link>
          <Link className="btn" href={`/employees/${l.employee_id}/salary`}>
            ข้อมูลเงินเดือน
          </Link>
          <Link href={`/payroll/${id}`}>กลับ</Link>
        </div>
      </div>
      <div className="grid">
        <div className="stat"><b>{money(l.gross)}</b><span>รายได้</span></div>
        <div className="stat"><b>{money(l.deductions)}</b><span>รายหัก</span></div>
        <div className="stat"><b>{money(l.net)}</b><span>สุทธิ</span></div>
        <div className="stat"><b>{money(l.tax)}</b><span>ภาษีงวดนี้</span></div>
      </div>
      <div className="cols">
        <div className="card">
          <h2>รายได้</h2>
          {inc.length ? list(inc) : <div className="empty">ไม่มี</div>}
        </div>
        <div className="card">
          <h2>รายหัก</h2>
          {ded.length ? list(ded) : <div className="empty">ไม่มี</div>}
        </div>
      </div>
      <div className="cols">
        <div className="card">
          <h2>ข้อมูลการคำนวณ</h2>
          <table className="tbl compact">
            <tbody>
              <tr><td>ประเภทการจ่าย</td><td className="num">{PAY_TYPE[d.pay_type] || d.pay_type || "-"}</td></tr>
              <tr><td>อัตรา</td><td className="num">{money(d.rate)}</td></tr>
              <tr><td>ค่าจ้างต่อวัน / ต่อชั่วโมง</td><td className="num">{money(d.day_rate)} / {money(d.hour_rate)}</td></tr>
              <tr><td>เงินได้ประจำ (งวดนี้)</td><td className="num">{money(d.taxable_regular)}</td></tr>
              <tr><td>เงินได้ไม่ประจำ (งวดนี้)</td><td className="num">{money(d.taxable_irregular)}</td></tr>
              <tr><td>ประมาณการเงินได้ทั้งปี</td><td className="num">{money(d.projected_annual)}</td></tr>
              <tr><td>ภาษีทั้งปี (ประมาณการ)</td><td className="num">{money(d.annual_tax)}</td></tr>
              <tr><td>ภาษีหักสะสมก่อนงวดนี้</td><td className="num">{money(d.ytd_tax)}</td></tr>
              <tr><td>งวดคงเหลือในปี</td><td className="num">{d.remaining_periods ?? "-"}</td></tr>
              <tr><td>ฐานประกันสังคม</td><td className="num">{money(l.sso_base)}</td></tr>
              <tr><td>ประกันสังคม ลูกจ้าง / นายจ้าง</td><td className="num">{money(l.sso_employee)} / {money(l.sso_employer)}</td></tr>
              <tr><td>กองทุนสำรองเลี้ยงชีพ ลูกจ้าง / นายจ้าง</td><td className="num">{money(l.pf_employee)} / {money(l.pf_employer)}</td></tr>
              <tr><td>กองทุนสงเคราะห์ลูกจ้าง ลูกจ้าง / นายจ้าง</td><td className="num">{money(l.ewf_employee)} / {money(l.ewf_employer)}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>เวลาทำงานในงวด</h2>
          <table className="tbl compact">
            <tbody>
              <tr><td>วันทำงาน</td><td className="num">{a.work_days ?? "-"}</td></tr>
              <tr><td>มาทำงาน</td><td className="num">{a.present_days ?? "-"}</td></tr>
              <tr><td>ขาดงาน</td><td className="num">{a.absent_days ?? "-"}</td></tr>
              <tr><td>ลา (วัน)</td><td className="num">{a.leave_days ?? "-"}</td></tr>
              <tr><td>ลาไม่รับค่าจ้าง (วัน)</td><td className="num">{a.unpaid_leave_days ?? "-"}</td></tr>
              <tr><td>มาสาย (นาที)</td><td className="num">{a.late_min ?? "-"}</td></tr>
              <tr><td>กลับก่อน (นาที)</td><td className="num">{a.early_min ?? "-"}</td></tr>
              <tr><td>ลงเวลาไม่ครบ (วัน)</td><td className="num">{a.missing ?? "-"}</td></tr>
            </tbody>
          </table>
          <p className="small muted">
            ช่องทางรับเงิน: {l.payment_method === "cash" ? "เงินสด" : `${l.bank_name || "-"} ${l.bank_account || ""}`}
          </p>
        </div>
      </div>
    </>
  );
}
