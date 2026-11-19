import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { loadProfile } from "@/lib/profile";
import { options, payItems } from "@/lib/lookups";
import { NameOpt, Opt } from "@/lib/fields";
import {
  addLiability, addRecurringItem, deleteRecurringItem, saveTaxAllowances, toggleLiability, updateSSO, updateSalary,
} from "@/app/actions/employees";
import { PAY_TYPE, PERIOD_STATUS, fd, money, todayBkk } from "@/lib/util";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";
import ConfirmButton from "@/components/ConfirmButton";

const LIAB: Record<string, string> = {
  loan: "เงินกู้ / ผ่อนชำระ",
  advance: "เบิกเงินล่วงหน้า",
  legal_execution: "กรมบังคับคดี",
  student_loan: "กยศ. / กรอ.",
  other: "อื่นๆ",
};

export default async function Salary({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { e, seeSalary, canSalary, self } = await loadProfile(id);
  if (!seeSalary) notFound();
  const tab = ["items", "history", "tax", "sso", "liabilities", "slips"].includes(sp.tab) ? sp.tab : "salary";
  const base = `/employees/${e.id}/salary`;
  const year = Number(sp.year) || Number(todayBkk().slice(0, 4));
  const ro = !canSalary;

  return (
    <>
      <Notice sp={sp} />
      <Tabs
        small
        tabs={[
          { href: base, label: "เงินเดือน", on: tab === "salary" },
          { href: `${base}?tab=items`, label: "รายได้รายหักประจำ", on: tab === "items" },
          { href: `${base}?tab=history`, label: "ประวัติการปรับเงินเดือน", on: tab === "history" },
          { href: `${base}?tab=tax`, label: "ลดหย่อน / เงินสะสมประจำปี", on: tab === "tax" },
          { href: `${base}?tab=sso`, label: "ประกันสังคม", on: tab === "sso" },
          { href: `${base}?tab=liabilities`, label: "ภาระหนี้สิน / กรมบังคับคดี", on: tab === "liabilities" },
          { href: `${base}?tab=slips`, label: "เอกสารเงินเดือน", on: tab === "slips" },
        ]}
      />
      {tab === "salary" && <SalaryForm e={e} ro={ro} />}
      {tab === "items" && <Items e={e} ro={ro} />}
      {tab === "history" && <History e={e} />}
      {tab === "tax" && <Tax e={e} ro={ro} year={year} base={base} />}
      {tab === "sso" && <SSO e={e} ro={ro} />}
      {tab === "liabilities" && <Liabilities e={e} ro={ro} />}
      {tab === "slips" && <Slips e={e} self={self} />}
    </>
  );
}

async function SalaryForm({ e, ro }: any) {
  const banks = await options("bank");
  return (
    <div className="card">
      <h2>ข้อมูลเงินเดือน ({PAY_TYPE[e.pay_type] || "-"})</h2>
      <form action={updateSalary} className="fields">
        <input type="hidden" name="id" value={e.id} />
        <fieldset disabled={ro} style={{ display: "contents" }}>
          <label>
            {e.pay_type === "daily" ? "ค่าจ้างต่อวัน" : e.pay_type === "hourly" ? "ค่าจ้างต่อชั่วโมง" : "เงินเดือน"} (บาท)*
            <input type="number" step="0.01" name="salary" defaultValue={e.salary} required />
          </label>
          <label>
            วันที่มีผล (กรณีปรับ)
            <input type="date" name="effective_date" defaultValue={todayBkk()} />
          </label>
          <label>
            วิธีการชำระเงิน*
            <select name="payment_method" defaultValue={e.payment_method}>
              <option value="bank">ธนาคาร</option>
              <option value="cash">เงินสด</option>
            </select>
          </label>
          <label>
            ธนาคาร
            <select name="bank_name" defaultValue={e.bank_name ?? ""}>
              <NameOpt list={banks} />
            </select>
          </label>
          <label>
            เลขที่บัญชีพนักงาน
            <input name="bank_account" defaultValue={e.bank_account ?? ""} />
          </label>
          <label>
            การคำนวณภาษี*
            <select name="tax_method" defaultValue={e.tax_method}>
              <option value="withhold">บุคคลธรรมดา (หัก ณ ที่จ่าย)</option>
              <option value="company_once">บริษัทออกภาษีให้ครั้งเดียว</option>
              <option value="company_always">บริษัทออกภาษีให้ตลอดไป</option>
              <option value="none">ไม่คำนวณภาษี</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" name="pf_enabled" defaultChecked={e.pf_enabled} /> สมาชิกกองทุนสำรองเลี้ยงชีพ
          </label>
          <label>
            อัตราสะสม (%)
            <input type="number" step="0.01" name="pf_employee_rate" defaultValue={e.pf_employee_rate} />
          </label>
          <label>
            อัตราสมทบนายจ้าง (%)
            <input type="number" step="0.01" name="pf_employer_rate" defaultValue={e.pf_employer_rate} />
          </label>
          <label>
            วันที่เข้ากองทุน
            <input type="date" name="pf_join_date" defaultValue={e.pf_join_date ? String(e.pf_join_date).slice(0, 10) : ""} />
          </label>
          <label className="check">
            <input type="checkbox" name="ewf_enabled" defaultChecked={e.ewf_enabled} /> สมาชิกกองทุนสงเคราะห์ลูกจ้าง
          </label>
          <label className="full">
            หมายเหตุ (บันทึกในประวัติการปรับเงินเดือน)
            <input name="note" />
          </label>
          {!ro && <button className="btn primary">บันทึก</button>}
        </fieldset>
      </form>
    </div>
  );
}

async function Items({ e, ro }: any) {
  const [items, all] = await Promise.all([
    sql()`
      select x.*, x.start_date::text as sd, x.end_date::text as ed, p.code, p.name, p.kind
      from employee_pay_items x join pay_items p on p.id = x.pay_item_id where x.employee_id = ${e.id} order by p.kind desc, p.code`,
    payItems(),
  ]);
  return (
    <div className="card">
      <h2>รายได้ / รายหักประจำ</h2>
      {items.length === 0 ? <div className="empty">ไม่มีข้อมูล</div> : null}
      <table className="tbl compact">
        <tbody>
          {items.map((x: any) => (
            <tr key={x.id}>
              <td>{x.code}</td>
              <td>
                {x.name} <span className="small muted">({x.kind === "income" ? "รายได้" : "รายหัก"})</span>
              </td>
              <td className="num">{money(x.amount)}</td>
              <td>
                {x.sd ? fd(x.sd) : "เริ่มทันที"} – {x.ed ? fd(x.ed) : "ไม่กำหนด"}
              </td>
              <td>{x.note}</td>
              <td>
                {!ro && (
                  <form action={deleteRecurringItem}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="rid" value={x.id} />
                    <ConfirmButton message="ลบรายการนี้?">ลบ</ConfirmButton>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!ro && (
        <form action={addRecurringItem} className="fields" style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={e.id} />
          <label>
            รายการ*
            <select name="pay_item_id" required>
              <Opt
                list={all.filter((p: any) => !["salary", "ot", "sso", "wht", "pf", "ewf", "unpaid_leave", "absence", "late"].includes(p.system_key))}
                label={(p: any) => `${p.code} ${p.name} (${p.kind === "income" ? "รายได้" : "รายหัก"})`}
              />
            </select>
          </label>
          <label>
            จำนวนเงินต่องวด*
            <input type="number" step="0.01" name="amount" required />
          </label>
          <label>
            ตั้งแต่
            <input type="date" name="start_date" />
          </label>
          <label>
            ถึง
            <input type="date" name="end_date" />
          </label>
          <label>
            หมายเหตุ
            <input name="note" />
          </label>
          <button className="btn">เพิ่ม</button>
        </form>
      )}
    </div>
  );
}

async function History({ e }: any) {
  const rows = await sql()`
    select h.*, h.effective_date::text as d, u.first_name as uf, u.last_name as ul from salary_history h
    left join employees u on u.id = h.created_by where h.employee_id = ${e.id} order by h.effective_date desc, h.id desc`;
  return (
    <div className="card scroll">
      <h2>ประวัติการปรับเงินเดือน</h2>
      {rows.length === 0 ? <div className="empty">ไม่มีข้อมูล</div> : null}
      <table className="tbl compact">
        <thead>
          <tr>
            <th>วันที่มีผล</th>
            <th>ประเภทการดำเนินการ</th>
            <th className="num">ก่อนปรับ</th>
            <th className="num">หลังปรับ</th>
            <th className="num">อัตราปรับ</th>
            <th>หมายเหตุ</th>
            <th>ผู้ดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id}>
              <td>{fd(r.d)}</td>
              <td>{r.action}</td>
              <td className="num">{r.amount_before ? money(r.amount_before) : "-"}</td>
              <td className="num">{money(r.amount_after)}</td>
              <td className="num">
                {r.amount_before && Number(r.amount_before) > 0
                  ? `${(((Number(r.amount_after) - Number(r.amount_before)) / Number(r.amount_before)) * 100).toFixed(2)}%`
                  : "-"}
              </td>
              <td>{r.note}</td>
              <td className="small">
                {r.uf} {r.ul}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Tax({ e, ro, year, base }: any) {
  const [a, o, ytd] = await Promise.all([
    sql()`select data from tax_allowances where employee_id = ${e.id} and year = ${year}`,
    sql()`select * from ytd_openings where employee_id = ${e.id} and year = ${year}`,
    sql()`
      select coalesce(sum(l.gross),0) as gross, coalesce(sum(l.tax),0) as tax, coalesce(sum(l.sso_employee),0) as sso,
             coalesce(sum(l.pf_employee),0) as pf
      from payroll_lines l join payroll_periods p on p.id = l.period_id
      where l.employee_id = ${e.id} and p.year = ${year} and p.status in ('approved','closed','paid')`,
  ]);
  const d = a[0]?.data || {};
  const op = o[0] || {};
  const f = (k: string, label: string, hint = "") => (
    <label>
      {label}
      <input type="number" step="0.01" name={k} defaultValue={d[k] ?? ""} placeholder={hint} />
    </label>
  );
  return (
    <>
      <div className="card">
        <div className="row">
          <h2>ลดหย่อนภาษี ปี {year + 543}</h2>
          <span className="spacer" />
          <Link className="btn sm" href={`${base}?tab=tax&year=${year - 1}`}>
            ‹ ปีก่อน
          </Link>
          <Link className="btn sm" href={`${base}?tab=tax&year=${year + 1}`}>
            ปีถัดไป ›
          </Link>
        </div>
        <form action={saveTaxAllowances} className="fields">
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="year" value={year} />
          <fieldset disabled={ro} style={{ display: "contents" }}>
            <label className="check">
              <input type="checkbox" name="spouse" defaultChecked={!!d.spouse} /> คู่สมรสไม่มีเงินได้ (60,000)
            </label>
            {f("children", "จำนวนบุตร (30,000/คน)")}
            {f("children_2018", "บุตรคนที่ 2+ เกิดตั้งแต่ 2561 (60,000/คน)")}
            {f("parents", "บิดามารดาที่อุปการะ (30,000/คน)")}
            {f("disabled", "อุปการะผู้พิการ (60,000/คน)")}
            {f("life_insurance", "เบี้ยประกันชีวิต", "≤ 100,000")}
            {f("health_insurance", "เบี้ยประกันสุขภาพ", "≤ 25,000")}
            {f("parent_health", "ประกันสุขภาพบิดามารดา", "≤ 15,000")}
            {f("pension_insurance", "ประกันชีวิตแบบบำนาญ")}
            {f("rmf", "RMF")}
            {f("ssf", "SSF")}
            {f("thai_esg", "Thai ESG", "≤ 300,000")}
            {f("home_loan_interest", "ดอกเบี้ยเงินกู้ที่อยู่อาศัย", "≤ 100,000")}
            {f("donation", "เงินบริจาคทั่วไป")}
            {f("donation_edu", "บริจาคการศึกษา/กีฬา (×2)")}
            {f("other", "ลดหย่อนอื่นๆ")}
            <div className="full muted small" style={{ marginTop: 6 }}>
              เงินได้และภาษีสะสมก่อนเริ่มใช้ระบบ (กรณีเริ่มใช้ระหว่างปี / ย้ายมาจากที่อื่น)
            </div>
            <label>
              เงินได้สะสม
              <input type="number" step="0.01" name="open_income" defaultValue={op.income ?? ""} />
            </label>
            <label>
              ภาษีสะสม
              <input type="number" step="0.01" name="open_tax" defaultValue={op.tax ?? ""} />
            </label>
            <label>
              ประกันสังคมสะสม
              <input type="number" step="0.01" name="open_sso" defaultValue={op.sso ?? ""} />
            </label>
            <label>
              กองทุนสำรองเลี้ยงชีพสะสม
              <input type="number" step="0.01" name="open_pf" defaultValue={op.pf ?? ""} />
            </label>
            {!ro && <button className="btn primary">บันทึก</button>}
          </fieldset>
        </form>
      </div>
      <div className="card">
        <h2>เงินสะสมประจำปี {year + 543} (จากงวดที่อนุมัติแล้ว)</h2>
        <div className="kpi">
          <div>
            <b>{money(Number(ytd[0].gross) + Number(op.income || 0))}</b>
            <span>เงินได้สะสม</span>
          </div>
          <div>
            <b>{money(Number(ytd[0].tax) + Number(op.tax || 0))}</b>
            <span>ภาษีหัก ณ ที่จ่าย</span>
          </div>
          <div>
            <b>{money(Number(ytd[0].sso) + Number(op.sso || 0))}</b>
            <span>ประกันสังคม</span>
          </div>
          <div>
            <b>{money(Number(ytd[0].pf) + Number(op.pf || 0))}</b>
            <span>กองทุนสำรองเลี้ยงชีพ</span>
          </div>
        </div>
        <p className="small" style={{ marginTop: 10 }}>
          <Link href={`/print/tawi50/${e.id}?year=${year}`} target="_blank">
            พิมพ์หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ปี {year + 543}
          </Link>
        </p>
      </div>
    </>
  );
}

function SSO({ e, ro }: any) {
  return (
    <div className="card">
      <h2>ประกันสังคม</h2>
      <form action={updateSSO} className="fields">
        <input type="hidden" name="id" value={e.id} />
        <fieldset disabled={ro} style={{ display: "contents" }}>
          <label className="check">
            <input type="checkbox" name="sso_enabled" defaultChecked={e.sso_enabled} /> นำส่งเงินประกันสังคม
          </label>
          <label className="check">
            <input type="checkbox" name="wcf_enabled" defaultChecked={e.wcf_enabled} /> นำส่งเงินกองทุนทดแทน (กท.20 ก)
          </label>
          <label>
            รหัสประกันสังคม
            <input name="sso_id" defaultValue={e.sso_id ?? ""} />
          </label>
          <label>
            เอกสารที่ใช้ยื่น
            <input name="sso_doc" defaultValue={e.sso_doc ?? ""} placeholder="บัตรประชาชน / หนังสือเดินทาง" />
          </label>
          <label>
            วันที่รับบัตรรับรองสิทธิ์
            <input type="date" name="sso_card_date" defaultValue={e.sso_card_date ? String(e.sso_card_date).slice(0, 10) : ""} />
          </label>
          <label>
            โรงพยาบาลที่เลือก
            <input name="sso_hospital" defaultValue={e.sso_hospital ?? ""} />
          </label>
          <label className="full">
            เหตุผลการสิ้นสุดความเป็นผู้ประกันตน
            <input name="sso_end_reason" defaultValue={e.sso_end_reason ?? ""} />
          </label>
          {!ro && <button className="btn primary">บันทึก</button>}
        </fieldset>
      </form>
    </div>
  );
}

async function Liabilities({ e, ro }: any) {
  const [rows, all] = await Promise.all([
    sql()`
      select l.*, l.start_date::text as sd, p.name as item,
        (select coalesce(sum(i.amount),0) from payroll_line_items i where i.note = 'liab:' || l.id) as paid
      from liabilities l left join pay_items p on p.id = l.pay_item_id where l.employee_id = ${e.id} order by l.created_at desc`,
    payItems(),
  ]);
  return (
    <div className="card">
      <h2>ภาระหนี้สิน / กรมบังคับคดี / กยศ.</h2>
      {rows.length === 0 ? <div className="empty">ไม่มีข้อมูล</div> : null}
      <table className="tbl compact">
        <thead>
          <tr>
            <th>ประเภท</th>
            <th>อ้างอิง</th>
            <th className="num">ยอดรวม</th>
            <th className="num">หักต่องวด</th>
            <th className="num">หักแล้ว</th>
            <th>เริ่ม</th>
            <th>สถานะ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l: any) => (
            <tr key={l.id}>
              <td>
                {LIAB[l.kind]}
                <div className="small muted">{l.item}</div>
              </td>
              <td>{l.reference}</td>
              <td className="num">{l.total ? money(l.total) : "-"}</td>
              <td className="num">{money(l.installment)}</td>
              <td className="num">{money(l.paid)}</td>
              <td>{fd(l.sd)}</td>
              <td>{l.active ? "ใช้งาน" : "ปิด"}</td>
              <td>
                {!ro && (
                  <form action={toggleLiability}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="rid" value={l.id} />
                    <button className="btn sm">{l.active ? "ปิด" : "เปิด"}</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!ro && (
        <form action={addLiability} className="fields" style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={e.id} />
          <label>
            ประเภท*
            <select name="kind" required>
              {Object.entries(LIAB).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            รายการหัก (เว้นว่าง = ตามประเภท)
            <select name="pay_item_id">
              <Opt list={all.filter((p: any) => p.kind === "deduction")} label={(p: any) => `${p.code} ${p.name}`} />
            </select>
          </label>
          <label>
            เลขที่อ้างอิง / เลขคดี
            <input name="reference" />
          </label>
          <label>
            ยอดรวม (เว้นว่าง = ไม่จำกัด)
            <input type="number" step="0.01" name="total" />
          </label>
          <label>
            หักต่องวด*
            <input type="number" step="0.01" name="installment" required />
          </label>
          <label>
            เริ่มหัก*
            <input type="date" name="start_date" required defaultValue={todayBkk()} />
          </label>
          <label>
            หมายเหตุ
            <input name="note" />
          </label>
          <button className="btn">เพิ่ม</button>
        </form>
      )}
    </div>
  );
}

async function Slips({ e, self }: any) {
  const rows = await sql()`
    select l.id, l.gross, l.deductions, l.net, p.id as pid, p.name, p.pay_date::text as pd, p.status
    from payroll_lines l join payroll_periods p on p.id = l.period_id
    where l.employee_id = ${e.id} and (${!self}::boolean or p.status in ('approved','closed','paid'))
    order by p.pay_date desc limit 36`;
  return (
    <div className="card">
      <h2>สลิปเงินเดือน</h2>
      {rows.length === 0 ? <div className="empty">ไม่มีข้อมูล</div> : null}
      <table className="tbl compact">
        <thead>
          <tr>
            <th>งวด</th>
            <th>วันที่จ่าย</th>
            <th className="num">รายได้</th>
            <th className="num">รายหัก</th>
            <th className="num">สุทธิ</th>
            <th>สถานะ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{fd(r.pd)}</td>
              <td className="num">{money(r.gross)}</td>
              <td className="num">{money(r.deductions)}</td>
              <td className="num">
                <b>{money(r.net)}</b>
              </td>
              <td>{PERIOD_STATUS[r.status]}</td>
              <td>
                <Link href={`/print/payslip/${r.id}`} target="_blank">
                  สลิป
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
