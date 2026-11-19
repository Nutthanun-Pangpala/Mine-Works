import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { branches, calendars, companies, employeesBrief, employmentTypes, options, positions, roles, shiftsList, units } from "@/lib/lookups";
import { createEmployee } from "@/app/actions/employees";
import { Opt, NameOpt } from "@/lib/fields";
import { fullName, todayBkk } from "@/lib/util";
import Notice from "@/components/Notice";

export default async function NewEmployee({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("employees", "create");
  const [cos, brs, uns, pos, emps, shifts, cals, ets, etypes, titles, banks, rls] = await Promise.all([
    companies(), branches(), units(), positions(), employeesBrief(), shiftsList(), calendars(), employmentTypes(),
    options("employee_type"), options("title"), options("bank"), roles(),
  ]);
  return (
    <>
      <div className="head">
        <div>
          <h1>เพิ่มพนักงาน</h1>
          <div className="muted">
            <Link href="/employees">พนักงาน</Link> / เพิ่มพนักงาน
          </div>
        </div>
      </div>
      <Notice sp={sp} />
      <form action={createEmployee}>
        <fieldset>
          <legend>1. ข้อมูลพนักงาน</legend>
          <div className="fields" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <label>
              ประเภท*
              <select name="person_type">
                <option value="thai">คนไทย</option>
                <option value="foreign">ชาวต่างชาติ</option>
              </select>
            </label>
            <label>
              คำนำหน้า
              <select name="title">
                <NameOpt list={titles} />
              </select>
            </label>
            <label>
              ชื่อ (TH)*
              <input name="first_name" required />
            </label>
            <label>
              นามสกุล (TH)*
              <input name="last_name" required />
            </label>
            <label>
              ชื่อ (EN)
              <input name="first_name_en" />
            </label>
            <label>
              นามสกุล (EN)
              <input name="last_name_en" />
            </label>
            <label>
              ชื่อเล่น
              <input name="nickname" />
            </label>
            <label>
              วันเกิด
              <input type="date" name="birth_date" />
            </label>
            <label>
              เพศ
              <select name="gender">
                <option value="">-</option>
                <option value="male">ชาย</option>
                <option value="female">หญิง</option>
                <option value="other">อื่นๆ</option>
              </select>
            </label>
            <label>
              เลขบัตรประชาชน
              <input name="national_id" maxLength={13} />
            </label>
            <label>
              เลขที่หนังสือเดินทาง
              <input name="passport_no" />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>2. การติดต่อ</legend>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <label>
              อีเมลบริษัท (ชื่อผู้ใช้งาน)
              <input type="email" name="work_email" />
            </label>
            <label>
              เบอร์ที่ทำงาน
              <input name="work_phone" />
            </label>
            <label>
              เบอร์มือถือ
              <input name="mobile" />
            </label>
            <label>
              อีเมลส่วนตัว
              <input type="email" name="personal_email" />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>3. การจ้างงาน</legend>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <label>
              รหัสพนักงาน (เว้นว่าง = อัตโนมัติ)
              <input name="code" />
            </label>
            <label>
              บริษัท*
              <select name="company_id" required defaultValue={cos[0]?.id}>
                <Opt list={cos} label="name_th" empty={null} />
              </select>
            </label>
            <label>
              สาขา
              <select name="branch_id">
                <Opt list={brs} />
              </select>
            </label>
            <label>
              สังกัด
              <select name="org_unit_id">
                <Opt list={uns} label="path" />
              </select>
            </label>
            <label>
              ตำแหน่ง
              <select name="position_id">
                <Opt list={pos} label={(p: any) => `${p.name}${p.level_code ? ` (${p.level_code})` : ""}`} />
              </select>
            </label>
            <label>
              ผู้บังคับบัญชา
              <select name="supervisor_id">
                <Opt list={emps} label={(e: any) => `${e.code} ${fullName(e)}`} />
              </select>
            </label>
            <label>
              วันที่เริ่มงาน*
              <input type="date" name="start_date" required defaultValue={todayBkk()} />
            </label>
            <label>
              วันครบทดลองงาน (เว้นว่าง = ตามเงื่อนไขบริษัท)
              <input type="date" name="probation_end_date" />
            </label>
            <label>
              วันสิ้นสุดสัญญาจ้าง
              <input type="date" name="contract_end_date" />
            </label>
            <label>
              สถานะ
              <select name="status">
                <option value="probation">ทดลองงาน</option>
                <option value="confirmed">บรรจุ</option>
              </select>
            </label>
            <label>
              ประเภทพนักงาน
              <select name="employee_type_id">
                <Opt list={etypes} />
              </select>
            </label>
            <label>
              ประเภทการจ้าง*
              <select name="employment_type_id" required>
                <Opt list={ets} empty={null} />
              </select>
            </label>
            <label>
              กะการทำงาน
              <select name="shift_id" defaultValue={shifts[0]?.id}>
                <Opt list={shifts} label={(s: any) => `${s.code} ${s.name}`} />
              </select>
            </label>
            <label>
              ปฏิทินวันหยุด
              <select name="calendar_id" defaultValue={cals.find((c: any) => c.is_default)?.id}>
                <Opt list={cals} />
              </select>
            </label>
            <label className="check">
              <input type="checkbox" name="no_clock" /> ไม่ต้องบันทึกเวลาเข้าออก
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>4. เงินเดือน</legend>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <label>
              เงินเดือน / ค่าจ้าง (บาท)
              <input type="number" step="0.01" name="salary" />
            </label>
            <label>
              วิธีการชำระเงิน
              <select name="payment_method">
                <option value="bank">ธนาคาร</option>
                <option value="cash">เงินสด</option>
              </select>
            </label>
            <label>
              ธนาคาร
              <select name="bank_name">
                <NameOpt list={banks} />
              </select>
            </label>
            <label>
              เลขที่บัญชี
              <input name="bank_account" />
            </label>
            <label className="check">
              <input type="checkbox" name="pf_enabled" /> สมาชิกกองทุนสำรองเลี้ยงชีพ
            </label>
            <label>
              อัตราสะสม (%)
              <input type="number" step="0.01" name="pf_employee_rate" />
            </label>
            <label>
              อัตราสมทบนายจ้าง (%)
              <input type="number" step="0.01" name="pf_employer_rate" />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>5. ประกันสังคมและบัญชีผู้ใช้</legend>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <label className="check">
              <input type="checkbox" name="no_sso" /> ไม่นำส่งประกันสังคม
            </label>
            <label>
              เลขประกันสังคม (เว้นว่าง = เลขบัตรประชาชน)
              <input name="sso_id" />
            </label>
            <label>
              รหัสผ่านเริ่มต้น (อย่างน้อย 8 ตัว)
              <input type="password" name="password" minLength={8} />
            </label>
            <label>
              บทบาทเพิ่มเติม
              <select name="role_ids" multiple size={4}>
                {rls
                  .filter((r: any) => !r.auto)
                  .map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </fieldset>
        <div className="row">
          <button className="btn primary">บันทึก</button>
          <Link className="btn" href="/employees">
            ยกเลิก
          </Link>
        </div>
      </form>
    </>
  );
}
