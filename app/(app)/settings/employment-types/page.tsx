import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { saveEmploymentType } from "@/app/actions/settings";
import { PAY_TYPE } from "@/lib/util";
import Notice from "@/components/Notice";

export default async function EmploymentTypes({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.payroll");
  const rows = await sql()`select * from employment_types order by id`;
  const t = sp.new ? null : rows.find((r: any) => r.id === Number(sp.id)) || rows[0];
  const c = t?.calc || { ot: true, late: true, absent: true, early: true };
  const r = t?.ot_rates || { ot1: 1, ot2: 1.5, ot3: 2, ot4: 3 };
  const chk = (k: string, label: string) => (
    <label className="check">
      <input type="checkbox" name={"calc_" + k} defaultChecked={!!c[k]} /> {label}
    </label>
  );
  return (
    <>
      <Notice sp={sp} />
      <div className="layout2" style={{ gridTemplateColumns: "200px 1fr" }}>
        <nav className="subnav">
          {rows.map((x: any) => (
            <Link key={x.id} href={`/settings/employment-types?id=${x.id}`} className={t?.id === x.id ? "on" : ""}>
              {x.name}
            </Link>
          ))}
          <Link href="/settings/employment-types?new=1" className={sp.new ? "on" : ""}>
            + เพิ่มประเภทการจ้าง
          </Link>
        </nav>
        <form action={saveEmploymentType} className="card" key={t?.id ?? "new"}>
          {t && <input type="hidden" name="id" value={t.id} />}
          <div className="fields" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <label>
              รหัส*
              <input name="code" required defaultValue={t?.code ?? ""} />
            </label>
            <label>
              ชื่อประเภทการจ้าง*
              <input name="name" required defaultValue={t?.name ?? ""} />
            </label>
            <label>
              ชื่อประเภทการจ้าง (EN)
              <input name="name_en" defaultValue={t?.name_en ?? ""} />
            </label>
            <label>
              ประเภทการจ่าย*
              <select name="pay_type" defaultValue={t?.pay_type ?? "monthly"}>
                {Object.entries(PAY_TYPE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" name="paid_traditional_holiday" defaultChecked={t ? t.paid_traditional_holiday : true} /> ได้รับค่าแรงวันหยุดตามประเพณี
            </label>
          </div>
          <fieldset style={{ marginTop: 14 }}>
            <legend>เงื่อนไขการคำนวณรายได้รายหัก</legend>
            <div className="row">
              {chk("ot", "ล่วงเวลา")}
              {chk("late", "สาย")}
              {chk("absent", "ขาดงาน")}
              {chk("forgot", "ลืมลงเวลา")}
              {chk("early", "กลับก่อน")}
              {chk("break_status", "คำนวณสถานะช่วงพัก")}
              {chk("flat_ot", "คำนวณค่าล่วงเวลาแบบเหมา")}
            </div>
          </fieldset>
          <fieldset>
            <legend>อัตราค่าล่วงเวลา (จำนวนเท่า)</legend>
            <div className="fields" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
              <label>
                OT1: ทำงานในวันหยุด
                <input type="number" step="0.01" name="ot1" defaultValue={r.ot1} />
              </label>
              <label>
                OT2: ล่วงเวลาในวันทำงาน*
                <input type="number" step="0.01" name="ot2" defaultValue={r.ot2} />
              </label>
              <label>
                OT3: ทำงานในวันหยุด (รายวัน)*
                <input type="number" step="0.01" name="ot3" defaultValue={r.ot3} />
              </label>
              <label>
                OT4: ล่วงเวลาในวันหยุด*
                <input type="number" step="0.01" name="ot4" defaultValue={r.ot4} />
              </label>
            </div>
          </fieldset>
          {t && (
            <label className="check">
              <input type="checkbox" name="active" defaultChecked={t.active} /> เปิดใช้งาน
            </label>
          )}
          <button className="btn primary" style={{ marginTop: 10 }}>
            บันทึก
          </button>
        </form>
      </div>
    </>
  );
}
