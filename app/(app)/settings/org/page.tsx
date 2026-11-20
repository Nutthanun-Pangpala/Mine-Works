import { requirePerm } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { saveOrgSettings } from "@/app/actions/settings";
import Notice from "@/components/Notice";

export default async function OrgSettings({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.org");
  const s = (await getSettings()).org;
  return (
    <>
      <Notice sp={sp} />
      <form action={saveOrgSettings}>
        <div className="card">
          <h2>ทั่วไป</h2>
          <div className="fields" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            <label>
              กำหนดรหัสพนักงานอัตโนมัติ
              <select name="emp_code_mode" defaultValue={s.emp_code?.mode}>
                <option value="standard">แบบมาตรฐาน (00001)</option>
                <option value="custom">แบบกำหนดเอง (คำนำหน้า + ตัวเลข)</option>
              </select>
            </label>
            <label>
              คำนำหน้ารหัส
              <input name="emp_code_prefix" defaultValue={s.emp_code?.prefix} placeholder="เช่น MW" />
            </label>
            <label>
              จำนวนหลักตัวเลข
              <input type="number" name="emp_code_digits" defaultValue={s.emp_code?.digits ?? 5} min={1} max={10} />
            </label>
            <label>
              รูปแบบการยืนยันตัวตนเมื่อลงเวลา
              <select name="clock_verify" defaultValue={s.clock_verify}>
                <option value="none">ไม่ยืนยันตัวตน</option>
                <option value="gps">ตรวจสอบพิกัด GPS</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" name="daily_report" defaultChecked={s.daily_report} /> เปิดใช้งานรายงานประจำวัน
            </label>
            <label>
              การมองเห็นข้อมูลหน้านิวส์ฟีด
              <select name="newsfeed" defaultValue={s.newsfeed}>
                <option value="all">ทุกบริษัท</option>
                <option value="company">เฉพาะบริษัทตนเอง</option>
              </select>
            </label>
            <label>
              เบิกค่าใช้จ่ายย้อนหลังได้ (วัน)
              <input type="number" name="expense_backdate_days" defaultValue={s.expense_backdate_days} />
            </label>
            <label>
              วันตัดรอบค่าใช้จ่ายรายเดือน
              <input type="number" name="expense_cutoff_day" defaultValue={s.expense_cutoff_day} min={1} max={31} />
            </label>
            <label>
              ออกเอกสารภาษีเงินได้ (ภ.ง.ด.)
              <select name="pnd_basis" defaultValue={s.pnd_basis}>
                <option value="period_end">ตามวันสิ้นงวดเงินเดือน (แนะนำ)</option>
                <option value="pay_date">ตามวันที่จ่าย</option>
              </select>
            </label>
          </div>
        </div>
        <div className="card">
          <h2>ปรับแต่ง</h2>
          <div className="fields" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            <label>
              โค้ดเชิญเข้าระบบ
              <input name="invitation_code" defaultValue={s.invitation_code} />
            </label>
            <label>
              สีธีม
              <input type="color" name="theme" defaultValue={s.theme} />
            </label>
          </div>
        </div>
        <div className="card">
          <h2>ความปลอดภัยและความเป็นส่วนตัว</h2>
          <div className="fields" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            <label>
              รหัสเปิดสลิปเงินเดือน / เอกสารส่วนตัว
              <select name="passcode" defaultValue={s.passcode}>
                <option value="dob">วันเดือนปีเกิด (ddmmyyyy)</option>
                <option value="id4">เลขบัตรประชาชน 4 ตัวท้าย</option>
                <option value="none">ไม่ใช้รหัส</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" name="show_mobile" defaultChecked={s.show_mobile} /> เปิดการมองเห็นเบอร์มือถือส่วนตัว
            </label>
            <label className="check">
              <input type="checkbox" name="show_birthday" defaultChecked={s.show_birthday} /> เปิดการมองเห็นวันเกิด
            </label>
          </div>
        </div>
        <button className="btn primary">บันทึก</button>
      </form>
    </>
  );
}
