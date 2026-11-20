import { notFound, redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Letterhead, Sign, bahtText, companyFor, signerFor } from "@/lib/print";
import { CERT_DOCS, fdLong, fullName, money, todayBkk } from "@/lib/util";

const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fdEn = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${EN_MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "-");

export default async function Certificate({ params }: { params: Promise<{ reqId: string }> }) {
  const { reqId } = await params;
  const u = await requireUser();
  const r = (await sql()`select * from requests where id = ${Number(reqId)} and doc_type = 'doc'`)[0];
  if (!r) notFound();
  const approver = (await sql()`select 1 from request_steps where request_id = ${r.id} and approver_id = ${u.id}`).length > 0;
  if (!(r.employee_id === u.id || can(u, "employees") || approver)) redirect("/?error=forbidden");
  if (r.status !== "approved") redirect(`/documents/${r.id}?error=state`);
  const kind: string = r.payload?.cert || "work_cert";
  if (kind === "tawi50") redirect(`/print/tawi50/${r.employee_id}?year=${Number(todayBkk().slice(0, 4)) - 1}`);
  if (kind === "payslip") {
    const l = await sql()`select l.id from payroll_lines l join payroll_periods p on p.id = l.period_id
                          where l.employee_id = ${r.employee_id} and p.status in ('approved','closed','paid') order by p.pay_date desc limit 1`;
    if (!l.length) redirect(`/documents/${r.id}?error=notfound`);
    redirect(`/print/payslip/${l[0].id}`);
  }
  const e = (
    await sql()`
      select e.*, e.start_date::text as sd, e.end_date::text as ed, p.name as position, p.name_en as position_en, ou.name as unit, ou.name_en as unit_en
      from employees e left join positions p on p.id = e.position_id left join org_units ou on ou.id = e.org_unit_id
      where e.id = ${r.employee_id}`
  )[0];
  const c = await companyFor(e.company_id);
  const signer = await signerFor(c, kind);
  const en = r.payload?.lang === "en" || kind === "visa_cert";
  const withSalary = kind === "salary_cert" || kind === "visa_cert";
  const still = e.status !== "terminated";
  const no = `HR ${String(r.id).padStart(5, "0")}/${Number(todayBkk().slice(0, 4)) + (en ? 0 : 543)}`;
  const today = todayBkk();
  return (
    <div className="paper cert">
      <Letterhead c={c} en={en} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <span>{en ? "Ref." : "ที่"} {no}</span>
        <span>{en ? fdEn(today) : fdLong(today)}</span>
      </div>
      <h2 style={{ textAlign: "center", margin: "28px 0" }}>
        {en ? (withSalary ? "EMPLOYMENT AND SALARY CERTIFICATE" : "EMPLOYMENT CERTIFICATE") : CERT_DOCS[kind]}
      </h2>
      {en ? (
        <>
          <p>To whom it may concern,</p>
          <p className="indent">
            This is to certify that {e.first_name_en || e.first_name} {e.last_name_en || e.last_name}
            {e.passport_no ? `, passport no. ${e.passport_no},` : e.national_id ? `, ID no. ${e.national_id},` : ""} {still ? "has been" : "was"} employed by{" "}
            {c.name_en || c.name_th} since {fdEn(e.sd)}
            {still ? " to present" : ` until ${fdEn(e.ed)}`}. {still ? "The current position is" : "The last position was"} {e.position_en || e.position || "-"}
            {e.unit_en || e.unit ? ` in ${e.unit_en || e.unit}` : ""}.
          </p>
          {withSalary && (
            <p className="indent">
              {still ? "The current" : "The last"} monthly salary is THB {money(e.salary)}.
            </p>
          )}
          <p className="indent">This certificate is issued upon the employee&apos;s request{kind === "visa_cert" ? " for visa application purposes" : ""}.</p>
          <div className="sign-right">
            <p>Sincerely yours,</p>
            <Sign s={signer} label="Authorized Signatory" en />
          </div>
        </>
      ) : (
        <>
          <p className="indent">
            หนังสือฉบับนี้ให้ไว้เพื่อรับรองว่า {fullName(e)} {e.national_id ? `เลขประจำตัวประชาชน ${e.national_id}` : ""} {still ? "เป็นพนักงานของ" : "เคยเป็นพนักงานของ"}{" "}
            {c.name_th} ตั้งแต่วันที่ {fdLong(e.sd)} {still ? "จนถึงปัจจุบัน" : `ถึงวันที่ ${fdLong(e.ed)}`} {still ? "ปัจจุบันดำรงตำแหน่ง" : "ตำแหน่งสุดท้าย"}{" "}
            {e.position || "-"} {e.unit ? `สังกัด ${e.unit}` : ""}
          </p>
          {withSalary && (
            <p className="indent">
              โดยได้รับเงินเดือนเดือนละ {money(e.salary)} บาท ({bahtText(e.salary)})
            </p>
          )}
          <p className="indent">ให้ไว้ ณ วันที่ {fdLong(today)} เพื่อใช้เป็นหลักฐานตามที่พนักงานร้องขอ</p>
          <div className="sign-right">
            <p>ขอแสดงความนับถือ</p>
            <Sign s={signer} label="ผู้มีอำนาจลงนาม" />
          </div>
        </>
      )}
    </div>
  );
}
