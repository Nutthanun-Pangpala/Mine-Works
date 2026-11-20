import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { deleteShift, saveShift } from "@/app/actions/settings";
import { TH_DOW } from "@/lib/util";
import Notice from "@/components/Notice";
import ConfirmButton from "@/components/ConfirmButton";

const grid = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", alignItems: "end" } as const;
const t = (v: any) => (v ? String(v).slice(0, 5) : "");

export default async function ShiftEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requirePerm("settings.time");
  const s: any =
    id === "new"
      ? { weekdays: [1, 2, 3, 4, 5], allow_ot: true, active: true, start_time: "08:00", end_time: "17:00", break_start: "12:00", break_end: "13:00", shift_type: "morning", color: "#0f5f5c" }
      : (await sql()`select * from shifts where id = ${Number(id)}`)[0];
  if (!s) notFound();
  const cos = await companies();
  return (
    <>
      <div className="row">
        <h2 style={{ margin: 0 }}>{s.id ? "แก้ไขกะการทำงาน" : "เพิ่มกะการทำงาน"}</h2>
        <span className="spacer" />
        <Link href="/settings/shifts">กลับ</Link>
      </div>
      <Notice sp={sp} />
      <form action={saveShift}>
        {s.id && <input type="hidden" name="id" value={s.id} />}
        <fieldset>
          <legend>ข้อมูลกะ</legend>
          <div style={grid}>
            <label>
              ชื่อกะ*
              <input name="name" required defaultValue={s.name ?? ""} />
            </label>
            <label>
              รหัสกะ*
              <input name="code" required defaultValue={s.code ?? ""} />
            </label>
            <label>
              บริษัท*
              <select name="company_id" defaultValue={s.company_id ?? ""}>
                <Opt list={cos} label="name_th" empty="ใช้กับทุกบริษัท" />
              </select>
            </label>
            <label>
              Time Zone*
              <select name="timezone" defaultValue={s.timezone ?? "Asia/Bangkok"}>
                <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
              </select>
            </label>
            <label className="full">
              รายละเอียด
              <input name="description" defaultValue={s.description ?? ""} />
            </label>
            <label>
              ประเภทกะ
              <select name="shift_type" defaultValue={s.shift_type}>
                <option value="morning">เช้า</option>
                <option value="afternoon">บ่าย</option>
                <option value="night">ดึก</option>
                <option value="flex">ยืดหยุ่น</option>
              </select>
            </label>
            <label>
              สีประจำกะ
              <input type="color" name="color" defaultValue={s.color ?? "#0f5f5c"} />
            </label>
            <label className="check">
              <input type="checkbox" name="allow_ot" defaultChecked={s.allow_ot} /> ขอทำงานล่วงเวลาได้
            </label>
            <label>
              ช่วงเวลาที่ใช้คำนวณค่าล่วงเวลาในวันหยุด
              <select name="holiday_ot_basis" defaultValue={s.holiday_ot_basis ?? "previous_shift"}>
                <option value="previous_shift">ใช้กะทำงานก่อนหน้า</option>
                <option value="this_shift">ใช้กะนี้</option>
              </select>
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>ช่วงเวลากะ</legend>
          <div style={grid}>
            <label>
              เวลาเข้างาน*
              <input type="time" name="start_time" required defaultValue={t(s.start_time)} />
            </label>
            <label>
              เวลาออกงาน*
              <input type="time" name="end_time" required defaultValue={t(s.end_time)} />
            </label>
            <label>
              เริ่มพัก
              <input type="time" name="break_start" defaultValue={t(s.break_start)} />
            </label>
            <label>
              สิ้นสุดพัก
              <input type="time" name="break_end" defaultValue={t(s.break_end)} />
            </label>
            <label>
              ล่วงเวลา ตั้งแต่
              <input type="time" name="ot_start" defaultValue={t(s.ot_start)} />
            </label>
            <label>
              ล่วงเวลา ถึง
              <input type="time" name="ot_end" defaultValue={t(s.ot_end)} />
            </label>
            <div className="full">
              <div className="small muted">วันที่มีผล</div>
              <div className="row">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <label key={d} className="check">
                    <input type="checkbox" name="weekdays" value={d} defaultChecked={(s.weekdays || []).includes(d)} /> {TH_DOW[d]}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>นโยบายการเข้างานและตั้งค่าเพิ่มเติม</legend>
          <div style={grid}>
            <label className="check">
              <input type="checkbox" name="flexible" defaultChecked={s.flexible} /> อนุญาตให้เข้างานแบบยืดหยุ่นได้
            </label>
            <label>
              ยืดหยุ่นได้ (นาที)
              <input type="number" name="flex_minutes" defaultValue={s.flex_minutes ?? 0} />
            </label>
            <label>
              ช่วงเวลาโอทีก่อนเริ่มงาน (นาที)
              <input type="number" name="pre_ot_minutes" defaultValue={s.pre_ot_minutes ?? 0} />
            </label>
            <label className="check">
              <input type="checkbox" name="auto_ot" defaultChecked={s.auto_ot} /> คำนวณโอทีอัตโนมัติ
            </label>
            <label>
              เมื่อทำงานล่วงเวลาครบ (นาที)
              <input type="number" name="auto_ot_min_minutes" defaultValue={s.auto_ot_min_minutes ?? 60} />
            </label>
            <label>
              ค่ากะต่อวัน (บาท)
              <input type="number" step="0.01" name="allowance" defaultValue={s.allowance ?? 0} />
            </label>
            <label className="check">
              <input type="checkbox" name="break_status" defaultChecked={s.break_status} /> คำนวณสถานะช่วงพัก
            </label>
            {s.id && (
              <label className="check">
                <input type="checkbox" name="active" defaultChecked={s.active} /> เปิดใช้งาน
              </label>
            )}
          </div>
        </fieldset>
        <div className="row">
          <button className="btn primary">บันทึก</button>
          <Link className="btn" href="/settings/shifts">
            ยกเลิก
          </Link>
        </div>
      </form>
      {s.id && (
        <form action={deleteShift} style={{ marginTop: 14 }}>
          <input type="hidden" name="id" value={s.id} />
          <ConfirmButton message="ลบกะนี้? (ลบไม่ได้หากมีพนักงานใช้งานอยู่)">ลบกะ</ConfirmButton>
        </form>
      )}
    </>
  );
}
