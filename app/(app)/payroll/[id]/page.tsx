import Link from "next/link";
import { notFound } from "next/navigation";
import { canPayroll, requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Opt } from "@/lib/fields";
import { addManualItem, calculate, deleteManualItem, deletePeriod, sendSlips, transition, updatePeriod } from "@/app/actions/payroll";
import { PERIOD_STATUS, fd, fdt, fullName, money } from "@/lib/util";
import Notice from "@/components/Notice";
import ConfirmButton from "@/components/ConfirmButton";

const ORDER = ["draft", "calculated", "reviewed", "approved", "closed", "paid"];

export default async function PeriodPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await requirePerm("payroll");
  const p = (
    await sql()`
      select p.*, p.start_date::text as sd, p.end_date::text as ed, p.att_start::text as asd, p.att_end::text as aed, p.pay_date::text as pd,
             c.name_th as company, et.name as et
      from payroll_periods p join companies c on c.id = p.company_id left join employment_types et on et.id = p.employment_type_id
      where p.id = ${Number(id)}`
  )[0];
  if (!p) notFound();
  const q = String(sp.q || "").trim();
  const [lines, manual, items, emps, totals] = await Promise.all([
    sql()`
      select l.*, e.code, e.first_name, e.last_name, e.bank_name, e.payment_method, ou.name as unit
      from payroll_lines l join employees e on e.id = l.employee_id left join org_units ou on ou.id = e.org_unit_id
      where l.period_id = ${p.id} and (${q} = '' or e.code ilike ${"%" + q + "%"} or e.first_name ilike ${"%" + q + "%"} or e.last_name ilike ${"%" + q + "%"})
      order by e.code`,
    sql()`
      select m.*, e.code, e.first_name, e.last_name, i.code as icode, i.name as iname, i.kind from payroll_manual_items m
      join employees e on e.id = m.employee_id join pay_items i on i.id = m.pay_item_id where m.period_id = ${p.id} order by m.id`,
    sql()`select id, code, name, kind from pay_items where active order by kind desc, sort`,
    sql()`select id, code, first_name, last_name from employees where company_id = ${p.company_id} and status <> 'pending' order by code`,
    sql()`
      select count(*)::int as n, coalesce(sum(gross),0) as gross, coalesce(sum(deductions),0) as ded, coalesce(sum(net),0) as net,
             coalesce(sum(tax),0) as tax, coalesce(sum(sso_employee),0) as sso_ee, coalesce(sum(sso_employer),0) as sso_er,
             coalesce(sum(pf_employee),0) as pf_ee, coalesce(sum(pf_employer),0) as pf_er, coalesce(sum(ewf_employee),0) as ewf_ee,
             coalesce(sum(ewf_employer),0) as ewf_er
      from payroll_lines where period_id = ${p.id}`,
  ]);
  const t = totals[0];
  const st = ORDER.indexOf(p.status);
  const editable = ["draft", "calculated", "reviewed"].includes(p.status);
  const btn = (step: string, label: string, perm: string, cls = "btn") =>
    canPayroll(u, perm) ? (
      <form action={transition}>
        <input type="hidden" name="id" value={p.id} />
        <input type="hidden" name="step" value={step} />
        <ConfirmButton message={`ยืนยัน: ${label}?`} className={cls}>
          {label}
        </ConfirmButton>
      </form>
    ) : null;

  return (
    <>
      <div className="head">
        <div>
          <h1>{p.name}</h1>
          <div className="muted">
            {p.company} {p.et ? `· ${p.et}` : ""} · งวด {fd(p.sd)} – {fd(p.ed)} · เวลาทำงาน {fd(p.asd)} – {fd(p.aed)} · จ่าย {fd(p.pd)}
          </div>
        </div>
        <Link href="/payroll">กลับ</Link>
      </div>
      <Notice sp={sp} />
      <div className="steps">
        {ORDER.map((s, i) => (
          <span key={s} className={i < st ? "done" : i === st ? "cur" : ""}>
            {PERIOD_STATUS[s]}
          </span>
        ))}
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        {editable && canPayroll(u, "calculate") && (
          <form action={calculate}>
            <input type="hidden" name="id" value={p.id} />
            <button className="btn primary">{p.status === "draft" ? "คำนวณเงินเดือน" : "คำนวณใหม่"}</button>
          </form>
        )}
        {p.status === "calculated" && btn("review", "ตรวจสอบเงินเดือน", "review")}
        {["calculated", "reviewed"].includes(p.status) && btn("approve", "อนุมัติเงินเดือน", "approve", "btn primary")}
        {["reviewed", "approved"].includes(p.status) && btn("reopen", "ย้อนกลับไปแก้ไข", "calculate")}
        {p.status === "approved" && btn("close", "ปิดงวดเงินเดือน", "close")}
        {["approved", "closed"].includes(p.status) && btn("pay", "บันทึกชำระเงินแล้ว", "pay", "btn primary")}
        {["paid", "closed"].includes(p.status) && btn("reverse", "ย้อนงวด", "reverse", "btn danger")}
        {st >= 3 && (
          <form action={sendSlips}>
            <input type="hidden" name="id" value={p.id} />
            <button className="btn">ส่งสลิปให้พนักงาน</button>
          </form>
        )}
        <span className="spacer" />
        {t.n > 0 && (
          <>
            <Link className="btn" href={`/print/payslips/${p.id}`} target="_blank">
              พิมพ์สลิปทั้งหมด
            </Link>
            <a className="btn" href={`/api/payroll/${p.id}/bank`}>
              ไฟล์นำส่งธนาคาร
            </a>
            <a className="btn" href={`/api/payroll/${p.id}/sso`}>
              ไฟล์ประกันสังคม
            </a>
            <a className="btn" href={`/api/payroll/${p.id}/pnd1`}>
              ภ.ง.ด.1
            </a>
            <a className="btn" href={`/api/payroll/${p.id}/summary`}>
              รายงานเงินเดือน
            </a>
          </>
        )}
      </div>

      <div className="grid">
        <div className="stat"><b>{t.n}</b><span>พนักงาน</span></div>
        <div className="stat"><b>{money(t.gross)}</b><span>รายได้รวม</span></div>
        <div className="stat"><b>{money(t.ded)}</b><span>รายหักรวม</span></div>
        <div className="stat"><b>{money(t.net)}</b><span>ยอดจ่ายสุทธิ</span></div>
        <div className="stat"><b>{money(t.tax)}</b><span>ภาษีหัก ณ ที่จ่าย</span></div>
        <div className="stat"><b>{money(Number(t.sso_ee) + Number(t.sso_er))}</b><span>ประกันสังคม (ลูกจ้าง+นายจ้าง)</span></div>
        <div className="stat"><b>{money(Number(t.pf_ee) + Number(t.pf_er))}</b><span>กองทุนสำรองฯ</span></div>
        <div className="stat"><b>{money(Number(t.gross) + Number(t.sso_er) + Number(t.pf_er) + Number(t.ewf_er))}</b><span>ต้นทุนนายจ้าง</span></div>
      </div>

      <div className="card scroll">
        <form className="inline" style={{ marginBottom: 8 }}>
          <input name="q" placeholder="ค้นหาพนักงาน" defaultValue={q} />
          <button className="btn sm">ค้นหา</button>
          {p.calculated_at ? <span className="small muted">คำนวณล่าสุด {fdt(p.calculated_at)}</span> : null}
        </form>
        {lines.length === 0 ? <div className="empty">ยังไม่ได้คำนวณ — กด “คำนวณเงินเดือน”</div> : null}
        <table className="tbl compact">
          {lines.length > 0 && (
            <thead>
              <tr>
                <th>รหัส</th>
                <th>พนักงาน</th>
                <th className="num">รายได้</th>
                <th className="num">ภาษี</th>
                <th className="num">ประกันสังคม</th>
                <th className="num">กองทุน</th>
                <th className="num">รายหักรวม</th>
                <th className="num">สุทธิ</th>
                <th>ขาด/ลา/สาย</th>
                <th></th>
              </tr>
            </thead>
          )}
          <tbody>
            {lines.map((l: any) => (
              <tr key={l.id}>
                <td>{l.code}</td>
                <td>
                  <Link href={`/payroll/${p.id}/employee/${l.employee_id}`}>{fullName(l)}</Link>
                  <div className="small muted">{l.unit || ""}</div>
                </td>
                <td className="num">{money(l.gross)}</td>
                <td className="num">{money(l.tax)}</td>
                <td className="num">{money(l.sso_employee)}</td>
                <td className="num">{money(Number(l.pf_employee) + Number(l.ewf_employee))}</td>
                <td className="num">{money(l.deductions)}</td>
                <td className="num">
                  <b>{money(l.net)}</b>
                </td>
                <td className="small">
                  {l.detail?.att ? `${l.detail.att.absent_days}/${l.detail.att.leave_days}/${l.detail.att.late_min}น.` : ""}
                </td>
                <td>
                  <Link className="small" href={`/print/payslip/${l.id}`} target="_blank">
                    สลิป
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          {lines.length > 0 && !q && (
            <tfoot>
              <tr>
                <td colSpan={2}>รวม</td>
                <td className="num">{money(t.gross)}</td>
                <td className="num">{money(t.tax)}</td>
                <td className="num">{money(t.sso_ee)}</td>
                <td className="num">{money(Number(t.pf_ee) + Number(t.ewf_ee))}</td>
                <td className="num">{money(t.ded)}</td>
                <td className="num">{money(t.net)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="cols">
        <div className="card">
          <h2>รายการปรับปรุงในงวด (รายได้/รายหักครั้งเดียว)</h2>
          {manual.length === 0 ? <div className="empty">ไม่มีรายการ</div> : null}
          <table className="tbl compact">
            <tbody>
              {manual.map((m: any) => (
                <tr key={m.id}>
                  <td>
                    {m.code} {fullName(m)}
                  </td>
                  <td>
                    {m.icode} {m.iname}
                  </td>
                  <td className="num">
                    {m.kind === "deduction" ? "-" : ""}
                    {money(m.amount)}
                  </td>
                  <td>{m.note}</td>
                  <td>
                    {editable && canPayroll(u, "adjust") && (
                      <form action={deleteManualItem}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="mid" value={m.id} />
                        <ConfirmButton message="ลบรายการนี้?">ลบ</ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {editable && canPayroll(u, "adjust") && (
            <form action={addManualItem} className="fields" style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={p.id} />
              <label>
                พนักงาน
                <select name="employee_id" required>
                  <Opt list={emps} label={(e: any) => `${e.code} ${fullName(e)}`} empty="กรุณาเลือก" />
                </select>
              </label>
              <label>
                รายการ
                <select name="pay_item_id" required>
                  <Opt list={items} label={(i: any) => `${i.code} ${i.name} (${i.kind === "income" ? "รายได้" : "รายหัก"})`} empty="กรุณาเลือก" />
                </select>
              </label>
              <label>
                จำนวนเงิน
                <input type="number" step="0.01" name="amount" required />
              </label>
              <label>
                หมายเหตุ
                <input name="note" />
              </label>
              <button className="btn">เพิ่มรายการ</button>
            </form>
          )}
        </div>
        <div className="card">
          <h2>ตั้งค่างวด</h2>
          <form action={updatePeriod} className="fields">
            <input type="hidden" name="id" value={p.id} />
            <fieldset disabled={!editable || !canPayroll(u, "adjust")} style={{ display: "contents" }}>
              <label className="full">
                ชื่องวด
                <input name="name" defaultValue={p.name} />
              </label>
              <label>
                วันที่จ่าย
                <input type="date" name="pay_date" defaultValue={p.pd} />
              </label>
              <label>
                เวลาทำงานตั้งแต่
                <input type="date" name="att_start" defaultValue={p.asd} />
              </label>
              <label>
                เวลาทำงานถึง
                <input type="date" name="att_end" defaultValue={p.aed} />
              </label>
              <button className="btn">บันทึก</button>
            </fieldset>
          </form>
          {(p.status === "draft" || (p.is_special && p.status !== "paid")) && (
            <form action={deletePeriod} style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={p.id} />
              <ConfirmButton message="ลบงวดนี้?">ลบงวด</ConfirmButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
