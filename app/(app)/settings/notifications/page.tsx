import { requirePerm } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { saveNotificationSettings } from "@/app/actions/settings";
import Notice from "@/components/Notice";

const MONTHLY: [string, string][] = [
  ["new_starters", "พนักงานเริ่มงาน"],
  ["probation_due", "พนักงานครบกำหนดทดลองงาน"],
  ["contract_due", "พนักงานครบกำหนดสัญญาจ้าง"],
  ["anniversary", "พนักงานครบรอบอายุงาน"],
  ["retirement", "พนักงานครบเกษียณอายุ"],
  ["birthdays", "วันเกิดพนักงาน"],
  ["work_permit", "ใบอนุญาตทำงานหมดอายุ"],
];
const INSTANT: [string, string][] = [
  ["action_approved", "การดำเนินการได้รับการอนุมัติ"],
  ["separation", "มีการทำเรื่องพ้นสภาพ"],
  ["new_employee_to_supervisor", "เพิ่มพนักงานใหม่บนระบบ (แจ้งผู้บังคับบัญชา)"],
  ["terminated_disable", "ปิดใช้งานบัญชีพนักงานพ้นสภาพ"],
  ["absent_3_days", "พนักงานขาดงานติดต่อเกิน 3 วัน"],
];

export default async function NotificationSettings({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.system");
  const s = (await getSettings()).notifications;
  const row = ([k, label]: [string, string]) => (
    <label key={k} className="check">
      <input type="checkbox" name={k} defaultChecked={s[k] !== false} /> {label}
    </label>
  );
  return (
    <>
      <Notice sp={sp} />
      <form action={saveNotificationSettings}>
        <div className="card">
          <h2>การแจ้งเตือนรายเดือน (ส่งถึงผู้มีบทบาท HR ภายในแอป)</h2>
          <label>
            ส่งการแจ้งเตือนในวันที่
            <input type="number" name="monthly_day" min={1} max={28} defaultValue={s.monthly_day ?? 1} style={{ width: 100 }} />
          </label>
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>{MONTHLY.map(row)}</div>
        </div>
        <div className="card">
          <h2>การแจ้งเตือนทันที</h2>
          <div style={{ display: "grid", gap: 6 }}>{INSTANT.map(row)}</div>
          <p className="small muted">เอกสารรออนุมัติ / อนุมัติ / ไม่อนุมัติ จะแจ้งผู้เกี่ยวข้องทุกครั้ง</p>
        </div>
        <button className="btn primary">บันทึก</button>
      </form>
    </>
  );
}
