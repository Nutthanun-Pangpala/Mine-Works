// Shared helpers for printable documents (payslip, certificates, 50 ทวิ, warning letters).
import { sql } from "@/lib/db";
import { fdLong, fullName, money } from "@/lib/util";

const DIGITS = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function readInt(n: number): string {
  if (n === 0) return "";
  if (n >= 1_000_000) return readInt(Math.floor(n / 1_000_000)) + "ล้าน" + readInt(n % 1_000_000);
  const s = String(n);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const pos = s.length - i - 1;
    if (d === 0) continue;
    if (pos === 1 && d === 1) out += "สิบ";
    else if (pos === 1 && d === 2) out += "ยี่สิบ";
    else if (pos === 0 && d === 1 && s.length > 1) out += "เอ็ด";
    else out += DIGITS[d] + PLACES[pos];
  }
  return out;
}

/** Thai baht text, e.g. 1250.50 → "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์" */
export function bahtText(amount: number | string | null | undefined): string {
  const v = Math.round(Number(amount || 0) * 100);
  if (!v) return "ศูนย์บาทถ้วน";
  const baht = Math.floor(v / 100);
  const satang = v % 100;
  return (baht ? readInt(baht) + "บาท" : "") + (satang ? readInt(satang) + "สตางค์" : "ถ้วน");
}

export async function companyFor(companyId: number | null) {
  return (await sql()`select * from companies where id = ${companyId ?? 0}`)[0] || (await sql()`select * from companies order by id limit 1`)[0];
}

export function companyAddress(c: any): string {
  return [c?.address_th, c?.subdistrict, c?.district, c?.province, c?.postcode].filter(Boolean).join(" ");
}

export function Letterhead({ c, en }: { c: any; en?: boolean }) {
  if (!c || c.doc_settings?.letterhead === false) return null;
  return (
    <div className="letterhead">
      {c.logo_file_id ? <img src={`/api/files/${c.logo_file_id}`} alt="" /> : null}
      <div>
        <b>{en ? c.name_en || c.name_th : c.name_th}</b>
        <div className="small">{en ? c.address_en || companyAddress(c) : companyAddress(c)}</div>
        <div className="small">
          {c.tax_id ? `${en ? "Tax ID" : "เลขประจำตัวผู้เสียภาษี"} ${c.tax_id}` : ""} {c.phone ? ` · ${en ? "Tel." : "โทร"} ${c.phone}` : ""}
        </div>
      </div>
    </div>
  );
}

/** Authorised signer configured in company document settings. */
export async function signerFor(c: any, key: string) {
  const id = c?.doc_settings?.signers?.[key];
  if (!id) return null;
  return (
    await sql()`select e.title, e.first_name, e.last_name, e.first_name_en, e.last_name_en, p.name as position, p.name_en as position_en
                from employees e left join positions p on p.id = e.position_id where e.id = ${id}`
  )[0];
}

export function Sign({ s, label, en }: { s: any; label: string; en?: boolean }) {
  return (
    <div className="sign">
      <div className="line" />
      <div>
        ({s ? (en ? `${s.first_name_en || s.first_name} ${s.last_name_en || s.last_name}` : fullName(s)) : "................................................"})
      </div>
      <div>{s ? (en ? s.position_en || s.position : s.position) || label : label}</div>
    </div>
  );
}

/** Loads everything a payslip needs for the given line ids. */
export async function loadSlips(lineIds: number[]) {
  if (!lineIds.length) return [];
  const lines = await sql()`
    select l.*, p.name as period, p.start_date::text as sd, p.end_date::text as ed, p.pay_date::text as pd, p.company_id, p.status as pstatus,
           e.code, e.title, e.first_name, e.last_name, e.bank_name, e.bank_account, e.payment_method, e.national_id,
           pos.name as position, ou.name as unit
    from payroll_lines l join payroll_periods p on p.id = l.period_id join employees e on e.id = l.employee_id
    left join positions pos on pos.id = e.position_id left join org_units ou on ou.id = e.org_unit_id
    where l.id = any(${lineIds}::int[]) order by e.code`;
  const items = await sql()`
    select li.line_id, li.amount, li.qty, i.code, i.name, i.kind from payroll_line_items li join pay_items i on i.id = li.pay_item_id
    where li.line_id = any(${lineIds}::int[]) order by i.kind desc, i.sort, i.code`;
  const ytd = await sql()`
    select l.id, (select coalesce(sum(x.gross),0) from payroll_lines x join payroll_periods xp on xp.id = x.period_id
                  where x.employee_id = l.employee_id and xp.status <> 'draft' and extract(year from xp.pay_date) = extract(year from p.pay_date)
                    and xp.pay_date <= p.pay_date) as income,
           (select coalesce(sum(x.tax),0) from payroll_lines x join payroll_periods xp on xp.id = x.period_id
                  where x.employee_id = l.employee_id and xp.status <> 'draft' and extract(year from xp.pay_date) = extract(year from p.pay_date)
                    and xp.pay_date <= p.pay_date) as tax,
           (select coalesce(sum(x.sso_employee),0) from payroll_lines x join payroll_periods xp on xp.id = x.period_id
                  where x.employee_id = l.employee_id and xp.status <> 'draft' and extract(year from xp.pay_date) = extract(year from p.pay_date)
                    and xp.pay_date <= p.pay_date) as sso,
           (select coalesce(sum(x.pf_employee),0) from payroll_lines x join payroll_periods xp on xp.id = x.period_id
                  where x.employee_id = l.employee_id and xp.status <> 'draft' and extract(year from xp.pay_date) = extract(year from p.pay_date)
                    and xp.pay_date <= p.pay_date) as pf,
           o.income as o_income, o.tax as o_tax, o.sso as o_sso, o.pf as o_pf
    from payroll_lines l join payroll_periods p on p.id = l.period_id
    left join ytd_openings o on o.employee_id = l.employee_id and o.year = extract(year from p.pay_date)
    where l.id = any(${lineIds}::int[])`;
  const companyIds = [...new Set(lines.map((l: any) => l.company_id))];
  const cos = await sql()`select * from companies where id = any(${companyIds}::int[])`;
  return lines.map((l: any) => {
    const y = ytd.find((x: any) => x.id === l.id) || {};
    return {
      ...l,
      company: cos.find((c: any) => c.id === l.company_id),
      items: items.filter((i: any) => i.line_id === l.id),
      ytd: {
        income: Number(y.income || 0) + Number(y.o_income || 0),
        tax: Number(y.tax || 0) + Number(y.o_tax || 0),
        sso: Number(y.sso || 0) + Number(y.o_sso || 0),
        pf: Number(y.pf || 0) + Number(y.o_pf || 0),
      },
    };
  });
}

export function Payslip({ s }: { s: any }) {
  const c = s.company || {};
  const inc = s.items.filter((i: any) => i.kind === "income");
  const ded = s.items.filter((i: any) => i.kind === "deduction");
  const rows = Math.max(inc.length, ded.length, 1);
  const showUnit = c.slip_settings?.show_unit !== "none";
  return (
    <div className={"paper slip" + (c.doc_settings?.paper === "A5" ? " a5" : "")}>
      <div className="slip-head">
        <div>
          <b>{c.name_th}</b>
          <div className="small">{companyAddress(c)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <b>สลิปเงินเดือน / PAYSLIP</b>
          <div className="small">{s.period}</div>
          <div className="small">วันที่จ่าย {fdLong(s.pd)}</div>
        </div>
      </div>
      <table className="slip-info">
        <tbody>
          <tr>
            <td>รหัสพนักงาน</td>
            <td>{s.code}</td>
            <td>ชื่อ-สกุล</td>
            <td>{fullName(s)}</td>
          </tr>
          <tr>
            <td>ตำแหน่ง</td>
            <td>{s.position || "-"}</td>
            <td>{showUnit ? "สังกัด" : ""}</td>
            <td>{showUnit ? s.unit || "-" : ""}</td>
          </tr>
          <tr>
            <td>รอบการจ่าย</td>
            <td>
              {fdLong(s.sd)} – {fdLong(s.ed)}
            </td>
            <td>ช่องทางรับเงิน</td>
            <td>{s.payment_method === "cash" ? "เงินสด" : `${s.bank_name || ""} ${s.bank_account || ""}`}</td>
          </tr>
        </tbody>
      </table>
      <table className="slip-items">
        <thead>
          <tr>
            <th>รายได้ (Earnings)</th>
            <th className="num">จำนวนเงิน</th>
            <th>รายการหัก (Deductions)</th>
            <th className="num">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              <td>{inc[i] ? inc[i].name : ""}</td>
              <td className="num">{inc[i] ? money(inc[i].amount) : ""}</td>
              <td>{ded[i] ? ded[i].name : ""}</td>
              <td className="num">{ded[i] ? money(ded[i].amount) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>รวมรายได้</td>
            <td className="num">{money(s.gross)}</td>
            <td>รวมรายการหัก</td>
            <td className="num">{money(s.deductions)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="slip-net">
        <span>เงินได้สุทธิ (Net Pay)</span>
        <b>{money(s.net)} บาท</b>
        <span className="small">({bahtText(s.net)})</span>
      </div>
      <table className="slip-info">
        <tbody>
          <tr>
            <td>เงินได้สะสมทั้งปี</td>
            <td className="num">{money(s.ytd.income)}</td>
            <td>ภาษีสะสมทั้งปี</td>
            <td className="num">{money(s.ytd.tax)}</td>
          </tr>
          <tr>
            <td>ประกันสังคมสะสม</td>
            <td className="num">{money(s.ytd.sso)}</td>
            <td>กองทุนสำรองเลี้ยงชีพสะสม</td>
            <td className="num">{money(s.ytd.pf)}</td>
          </tr>
        </tbody>
      </table>
      {c.slip_settings?.note ? <p className="small">{c.slip_settings.note}</p> : null}
      <p className="small muted">เอกสารนี้ออกโดยระบบอิเล็กทรอนิกส์ ไม่ต้องมีลายมือชื่อ</p>
    </div>
  );
}
