import { notFound, redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Sign, bahtText, companyAddress, companyFor, signerFor } from "@/lib/print";
import { fdLong, fullName, money, todayBkk } from "@/lib/util";

export default async function Tawi50({ params, searchParams }: { params: Promise<{ empId: string }>; searchParams: Promise<any> }) {
  const { empId } = await params;
  const sp = await searchParams;
  const u = await requireUser();
  const id = Number(empId);
  if (id !== u.id && !can(u, "payroll") && !can(u, "employees.salary")) redirect("/?error=forbidden");
  const year = Number(sp.year) || Number(todayBkk().slice(0, 4)) - 1;
  const e = (await sql()`select * from employees where id = ${id}`)[0];
  if (!e) notFound();
  const c = await companyFor(e.company_id);
  const [sum, split, open] = await Promise.all([
    sql()`
      select coalesce(sum(l.tax),0) as tax, coalesce(sum(l.sso_employee),0) as sso, coalesce(sum(l.pf_employee),0) as pf, count(*)::int as n
      from payroll_lines l join payroll_periods p on p.id = l.period_id
      where l.employee_id = ${id} and p.status in ('approved','closed','paid') and extract(year from p.pay_date) = ${year}`,
    sql()`
      select case when i.income_type like '40(2)%' then '40(2)' else '40(1)' end as t, coalesce(sum(li.amount),0) as amount
      from payroll_line_items li join pay_items i on i.id = li.pay_item_id join payroll_lines l on l.id = li.line_id
      join payroll_periods p on p.id = l.period_id
      where l.employee_id = ${id} and i.kind = 'income' and i.tax_mode <> 'none' and p.status in ('approved','closed','paid')
        and extract(year from p.pay_date) = ${year}
      group by 1`,
    sql()`select * from ytd_openings where employee_id = ${id} and year = ${year}`,
  ]);
  const o = open[0] || {};
  const inc1 = Number(split.find((r: any) => r.t === "40(1)")?.amount || 0) + Number(o.income || 0);
  const inc2 = Number(split.find((r: any) => r.t === "40(2)")?.amount || 0);
  const tax = Number(sum[0].tax) + Number(o.tax || 0);
  const sso = Number(sum[0].sso) + Number(o.sso || 0);
  const pf = Number(sum[0].pf) + Number(o.pf || 0);
  const signer = await signerFor(c, "tawi50");
  const payer = { withhold: 1, company_always: 2, company_once: 3 }[e.tax_method as string] || 1;
  const box = (n: number, label: string) => (
    <span style={{ marginRight: 18 }}>
      [{payer === n ? "✓" : " "}] ({n}) {label}
    </span>
  );
  return (
    <div className="paper tawi50">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="small">ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)</span>
        <span className="small">เล่มที่ {year} เลขที่ {e.code}</span>
      </div>
      <h2 style={{ textAlign: "center", margin: "8px 0" }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</h2>
      <div style={{ textAlign: "center" }} className="small">
        ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร
      </div>
      <div className="box">
        <b>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</b>
        <div>ชื่อ {c?.name_th}</div>
        <div>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) {c?.tax_id || "-"}</div>
        <div>ที่อยู่ {companyAddress(c) || "-"}</div>
      </div>
      <div className="box">
        <b>ผู้ถูกหักภาษี ณ ที่จ่าย</b>
        <div>ชื่อ {fullName(e)}</div>
        <div>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) {e.national_id || "-"}</div>
        <div>ที่อยู่ {e.address_registered || e.address_current || "-"}</div>
      </div>
      <div className="small">ลำดับที่ในแบบ: [✓] (1) ภ.ง.ด.1ก</div>
      <table className="slip-items" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>ประเภทเงินได้พึงประเมินที่จ่าย</th>
            <th>ปีภาษีที่จ่าย</th>
            <th className="num">จำนวนเงินที่จ่าย</th>
            <th className="num">ภาษีที่หักและนำส่งไว้</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)</td>
            <td>{year + 543}</td>
            <td className="num">{money(inc1)}</td>
            <td className="num">{money(tax)}</td>
          </tr>
          <tr>
            <td>2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)</td>
            <td>{inc2 ? year + 543 : ""}</td>
            <td className="num">{inc2 ? money(inc2) : ""}</td>
            <td className="num"></td>
          </tr>
          {["3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)", "4. ดอกเบี้ย เงินปันผล ฯลฯ ตามมาตรา 40 (4)", "5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากร", "6. อื่นๆ"].map((t) => (
            <tr key={t}>
              <td>{t}</td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
            <td className="num">{money(inc1 + inc2)}</td>
            <td className="num">{money(tax)}</td>
          </tr>
        </tfoot>
      </table>
      <p>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร): {bahtText(tax)}</p>
      <p>
        เงินที่จ่ายเข้า กองทุนประกันสังคม {money(sso)} บาท · กองทุนสำรองเลี้ยงชีพ {money(pf)} บาท
      </p>
      <p>
        ผู้จ่ายเงิน: {box(1, "หัก ณ ที่จ่าย")} {box(2, "ออกให้ตลอดไป")} {box(3, "ออกให้ครั้งเดียว")}
      </p>
      <p className="small">
        ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ textAlign: "center" }}>
          <Sign s={signer} label="ผู้มีหน้าที่หักภาษี ณ ที่จ่าย" />
          <div className="small">วันที่ออกหนังสือรับรอง {fdLong(todayBkk())}</div>
        </div>
      </div>
      <p className="small muted">
        คำเตือน: ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
      </p>
    </div>
  );
}
