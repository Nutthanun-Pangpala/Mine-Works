import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { employeesBrief, options } from "@/lib/lookups";
import { Opt, NameOpt } from "@/lib/fields";
import { conditionsOf, otRulesOf } from "@/lib/settings";
import { saveBranch, saveCompany, saveCompanyConditions, saveCompanyDocs, saveCompanyOT } from "@/app/actions/settings";
import { CERT_DOCS, fullName } from "@/lib/util";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";

const grid = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", alignItems: "end" } as const;

export default async function Company({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requirePerm("settings.org");
  const c = (await sql()`select * from companies where id = ${Number(id)}`)[0];
  if (!c) notFound();
  const tab = ["branches", "conditions", "ot", "docs"].includes(sp.tab) ? sp.tab : "info";
  const base = `/settings/companies/${c.id}`;
  return (
    <>
      <h2>{c.name_th}</h2>
      <Notice sp={sp} />
      <Tabs
        small
        tabs={[
          { href: base, label: "ข้อมูลบริษัท", on: tab === "info" },
          { href: `${base}?tab=branches`, label: "ข้อมูลสาขา", on: tab === "branches" },
          { href: `${base}?tab=conditions`, label: "เงื่อนไขการทำงาน", on: tab === "conditions" },
          { href: `${base}?tab=ot`, label: "เงื่อนไขล่วงเวลา", on: tab === "ot" },
          { href: `${base}?tab=docs`, label: "เอกสาร / สลิปเงินเดือน", on: tab === "docs" },
        ]}
      />
      {tab === "info" && <Info c={c} />}
      {tab === "branches" && <Branches c={c} />}
      {tab === "conditions" && <Conditions c={c} />}
      {tab === "ot" && <OT c={c} />}
      {tab === "docs" && <Docs c={c} />}
    </>
  );
}

async function Info({ c }: any) {
  const banks = await options("bank");
  return (
    <form action={saveCompany} className="card">
      <input type="hidden" name="id" value={c.id} />
      <div style={grid}>
        <label>
          รหัสบริษัท*
          <input name="code" defaultValue={c.code} required />
        </label>
        <label>
          ชื่อบริษัท*
          <input name="name_th" defaultValue={c.name_th} required />
        </label>
        <label>
          ชื่อบริษัท (EN)
          <input name="name_en" defaultValue={c.name_en ?? ""} />
        </label>
        <label>
          เลขประจำตัวผู้เสียภาษี
          <input name="tax_id" defaultValue={c.tax_id ?? ""} />
        </label>
        <label>
          เลขที่บัญชีนายจ้าง (ประกันสังคม)
          <input name="sso_employer_no" defaultValue={c.sso_employer_no ?? ""} />
        </label>
        <label>
          เบอร์โทรศัพท์
          <input name="phone" defaultValue={c.phone ?? ""} />
        </label>
        <label>
          ประเทศ*
          <input name="country" defaultValue={c.country ?? "ไทย"} />
        </label>
        <label className="full">
          ที่อยู่*
          <textarea name="address_th" rows={2} defaultValue={c.address_th ?? ""} />
        </label>
        <label className="full">
          ที่อยู่ (EN)
          <textarea name="address_en" rows={2} defaultValue={c.address_en ?? ""} />
        </label>
        <label>
          จังหวัด
          <input name="province" defaultValue={c.province ?? ""} />
        </label>
        <label>
          เขต/อำเภอ
          <input name="district" defaultValue={c.district ?? ""} />
        </label>
        <label>
          แขวง/ตำบล
          <input name="subdistrict" defaultValue={c.subdistrict ?? ""} />
        </label>
        <label>
          รหัสไปรษณีย์
          <input name="postcode" defaultValue={c.postcode ?? ""} />
        </label>
        <label>
          รูปแบบการทำจ่ายเงินเดือน*
          <select name="payroll_bank_mode" defaultValue={c.payroll_bank_mode}>
            <option value="single_single">1 บัญชี ทำจ่ายธนาคารเดียว</option>
            <option value="single_multi">1 บัญชี ทำจ่ายหลายธนาคาร</option>
            <option value="multi_single">หลายบัญชี ทำจ่ายธนาคารเดียว</option>
            <option value="multi_multi">หลายบัญชี ทำจ่ายหลายธนาคาร</option>
            <option value="none">ไม่กำหนด</option>
          </select>
        </label>
        <label>
          ธนาคารบริษัท
          <select name="bank_name" defaultValue={c.bank_name ?? ""}>
            <NameOpt list={banks} />
          </select>
        </label>
        <label>
          เลขที่บัญชีบริษัท
          <input name="bank_account" defaultValue={c.bank_account ?? ""} />
        </label>
        <label>
          โลโก้บริษัท (ไม่เกิน 4 MB)
          <input type="file" name="logo" accept="image/*" />
        </label>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={c.active} /> เปิดใช้งาน
        </label>
      </div>
      <button className="btn primary" style={{ marginTop: 12 }}>
        บันทึก
      </button>
    </form>
  );
}

async function Branches({ c }: any) {
  const rows = await sql()`select * from branches where company_id = ${c.id} order by code`;
  const form = (b: any) => (
    <form action={saveBranch} className="inline" key={b?.id ?? "new"}>
      <input type="hidden" name="company_id" value={c.id} />
      {b && <input type="hidden" name="id" value={b.id} />}
      <input name="code" placeholder="รหัสสาขา" defaultValue={b?.code ?? ""} required style={{ width: 100 }} />
      <input name="name" placeholder="ชื่อสาขา" defaultValue={b?.name ?? ""} required />
      <input name="province" placeholder="จังหวัด" defaultValue={b?.province ?? ""} />
      <input name="sso_branch_no" placeholder="ลำดับที่สาขา (สปส.)" defaultValue={b?.sso_branch_no ?? ""} style={{ width: 150 }} />
      <label className="check">
        <input type="checkbox" name="sso_submit" defaultChecked={b ? b.sso_submit : true} /> นำส่งประกันสังคม
      </label>
      {b && (
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={b.active} /> ใช้งาน
        </label>
      )}
      <button className="btn sm">{b ? "บันทึก" : "เพิ่มสาขา"}</button>
    </form>
  );
  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      {rows.map((b: any) => form(b))}
      <hr style={{ width: "100%", border: 0, borderTop: "1px solid var(--line)" }} />
      {form(null)}
    </div>
  );
}

function Conditions({ c }: any) {
  const k = conditionsOf(c) as any;
  const n = (name: string, label: string) => (
    <label>
      {label}
      <input type="number" step="any" name={name} defaultValue={k[name] ?? ""} />
    </label>
  );
  const b = (name: string, label: string) => (
    <label className="check">
      <input type="checkbox" name={name} defaultChecked={!!k[name]} /> {label}
    </label>
  );
  const sc = (name: string, label: string) => (
    <label>
      {label}
      <input type="number" step="any" name={"score_" + name} defaultValue={k.score?.[name] ?? 0} />
    </label>
  );
  return (
    <form action={saveCompanyConditions}>
      <input type="hidden" name="id" value={c.id} />
      <fieldset>
        <legend>ชั่วโมงทำงานและสถานะการทำงาน</legend>
        <div style={grid}>
          {n("hours_per_day", "จำนวนชั่วโมงการทำงานใน 1 วัน*")}
          {b("hours_from_shift", "คำนวณตามชั่วโมงในกะ")}
          <label>
            วันตัดรอบประจำปีของบริษัท (ดด-วว)*
            <input name="annual_cutoff" defaultValue={k.annual_cutoff} pattern="\d{2}-\d{2}" />
          </label>
          {n("late_grace_min", "นาทีก่อนเริ่มนับเป็นสาย*")}
          {b("late_deduct", "หักเงินกรณีสาย/กลับก่อน")}
          {n("absent_after_min", "สายเกินกี่นาทีนับเป็นขาดงาน*")}
          {b("absent_deduct", "หักเงินกรณีขาดงาน")}
        </div>
      </fieldset>
      <fieldset>
        <legend>คะแนนการเข้างาน (หักคะแนนต่อครั้ง จาก 100)</legend>
        <div style={grid}>
          {sc("absent", "ขาดงาน")}
          {sc("no_clock", "ไม่ทาบเข้า/ออก")}
          {sc("certify", "รับรองเวลา")}
          {sc("late", "สาย/กลับก่อน")}
          {sc("sick", "ลาป่วย")}
          {sc("sick_file", "ลาป่วย (แนบไฟล์)")}
          {sc("personal", "ลากิจ")}
          {sc("ordination", "ลาบวช")}
          {sc("maternity", "ลาคลอด")}
        </div>
      </fieldset>
      <fieldset>
        <legend>กะทำงาน และเบี้ยขยัน</legend>
        <div style={grid}>
          {b("shift_backdate", "ให้ขอเปลี่ยนกะย้อนหลังได้")}
          {n("shift_backdate_days", "ขอย้อนหลังได้ไม่เกิน (วัน)")}
          {b("supervisor_change_shift", "หัวหน้างานสามารถเปลี่ยนกะได้ตลอดเวลา")}
          {n("diligence_amount", "เบี้ยขยันต่อเดือน (บาท)")}
        </div>
      </fieldset>
      <fieldset>
        <legend>การทดลองงาน การเกษียณ และการพ้นสภาพ</legend>
        <div style={grid}>
          {n("probation_days", "ระยะเวลาทดลองงาน (วัน)")}
          {n("prorate_before_day", "คิดโปรเรตสิทธิ์การลาเดือนแรก เมื่อเริ่มงานก่อนวันที่")}
          {b("half_month_from_15", "คิดโปรเรตครึ่งเดือนหากเริ่มงานตั้งแต่วันที่ 15")}
          {n("retire_male", "อายุเกษียณพนักงานชาย")}
          {n("retire_female", "อายุเกษียณพนักงานหญิง")}
          {n("count_month_if_last_day_after", "นับเป็นเดือนทำงาน เมื่อทำงานวันสุดท้ายหลังวันที่")}
          {b("self_resign", "ให้ขอลาออกเองได้")}
          {b("auto_approve_separation", "อนุมัติการพ้นสภาพอัตโนมัติเมื่อถึงวันที่มีผล")}
        </div>
      </fieldset>
      <button className="btn primary">บันทึก</button>
    </form>
  );
}

function OT({ c }: any) {
  const r = otRulesOf(c) as any;
  const n = (name: string, label: string) => (
    <label>
      {label}
      <input type="number" step="any" name={name} defaultValue={r[name] ?? ""} />
    </label>
  );
  const b = (name: string, label: string) => (
    <label className="check">
      <input type="checkbox" name={name} defaultChecked={!!r[name]} /> {label}
    </label>
  );
  const bt: string[] = r.break_types || [];
  return (
    <form action={saveCompanyOT}>
      <input type="hidden" name="id" value={c.id} />
      <fieldset>
        <legend>การขอเบิก</legend>
        <div style={grid}>
          {n("min_minutes", "นาทีขั้นต่ำในการเบิก*")}
          {n("max_docs_per_day", "จำกัดจำนวนเอกสารต่อวัน (0 = ไม่จำกัด)")}
          {b("allow_backdate", "ให้เบิกย้อนหลัง")}
          {n("backdate_days", "เบิกย้อนหลังได้ไม่เกิน (วัน)")}
          {b("after_probation", "ต้องผ่านทดลองงาน")}
        </div>
      </fieldset>
      <fieldset>
        <legend>เงื่อนไข</legend>
        <div style={grid}>
          <label>
            รูปแบบการหักพัก
            <select name="break_mode" defaultValue={r.break_mode}>
              <option value="once">หักครั้งเดียว</option>
              <option value="every">หักทุกช่วง</option>
            </select>
          </label>
          <div>
            <div className="small muted">ประเภทที่หักพัก</div>
            {[
              ["before", "OT ก่อนเริ่มงาน"],
              ["after", "OT หลังเลิกงาน"],
              ["holiday_before", "OT ก่อนเริ่มงานในวันหยุด"],
              ["holiday_after", "OT หลังเลิกงานในวันหยุด"],
            ].map(([k, v]) => (
              <label key={k} className="check">
                <input type="checkbox" name="break_types" value={k} defaultChecked={bt.includes(k)} /> {v}
              </label>
            ))}
          </div>
          {n("break_minutes", "ระยะเวลาหักพัก (นาที)")}
          {n("break_after_minutes", "เมื่อทำงานไปแล้ว (นาที)")}
          {n("rounding_minutes", "ปัดเศษเวลาการทำงานล่วงเวลาที่ (นาที)")}
          {n("weekly_cap_hours", "จำกัดชั่วโมงล่วงเวลาต่อสัปดาห์")}
          {b("holiday_rate_by_shift", "ใช้เรตค่าล่วงเวลาสำหรับวันหยุดตามกะการทำงาน")}
          {b("abnormal_day_ot", "ได้รับค่าล่วงเวลาในวันที่สถานะการทำงานไม่ปกติ")}
          {b("flex_full_ot", "ได้รับค่าล่วงเวลาเต็มจำนวนเมื่อเข้างานตามกะยืดหยุ่น")}
        </div>
      </fieldset>
      <button className="btn primary">บันทึก</button>
    </form>
  );
}

async function Docs({ c }: any) {
  const emps = await employeesBrief();
  const d = c.doc_settings || {};
  const s = c.slip_settings || {};
  const signers = d.signers || {};
  return (
    <form action={saveCompanyDocs}>
      <input type="hidden" name="id" value={c.id} />
      <fieldset>
        <legend>รูปแบบเอกสารบริษัท</legend>
        <div style={grid}>
          <label className="check">
            <input type="checkbox" name="letterhead" defaultChecked={d.letterhead !== false} /> มีหัวกระดาษ
          </label>
          <label>
            ขนาดเอกสารของ Payslip
            <select name="paper" defaultValue={d.paper || "A4"}>
              <option value="A4">A4</option>
              <option value="A5">A5</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" name="pickup" defaultChecked={!!d.pickup} /> เปิดให้พนักงานเลือกรับเอกสารที่ฝ่ายบุคคล
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>ผู้มีอำนาจลงนาม</legend>
        <div style={grid}>
          {[...Object.entries(CERT_DOCS), ["warning", "หนังสือเตือน"]].map(([k, v]) => (
            <label key={k}>
              {v}
              <select name={"signer_" + k} defaultValue={signers[k] ?? ""}>
                <Opt list={emps} label={(e: any) => `${e.code} ${fullName(e)}`} />
              </select>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>สลิปเงินเดือน</legend>
        <div style={grid}>
          <label className="check">
            <input type="checkbox" name="employee_choose" defaultChecked={!!s.employee_choose} /> พนักงานสามารถเลือกช่องทางการรับ Payslip ได้
          </label>
          <label className="check">
            <input type="checkbox" name="auto_send" defaultChecked={!!s.auto_send} /> ส่งสลิปเงินเดือนอัตโนมัติเมื่อชำระงวด
          </label>
          <label>
            การแสดงข้อมูลสังกัด
            <select name="show_unit" defaultValue={s.show_unit || "auto"}>
              <option value="auto">อัตโนมัติ</option>
              <option value="unit">แสดงสังกัด</option>
              <option value="none">ไม่แสดง</option>
            </select>
          </label>
          <label className="full">
            ข้อความท้ายสลิป
            <input name="slip_note" defaultValue={s.note ?? ""} />
          </label>
        </div>
      </fieldset>
      <button className="btn primary">บันทึก</button>
    </form>
  );
}
