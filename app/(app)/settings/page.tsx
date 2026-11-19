import Link from "next/link";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export default async function SettingsHome() {
  await requireUser();
  const [noShift, noCal, cycles, cos] = await Promise.all([
    sql()`select count(*)::int as n from employees where status <> 'terminated' and shift_id is null`,
    sql()`select count(*)::int as n from employees where status <> 'terminated' and calendar_id is null`,
    sql()`select count(*)::int as n from payroll_cycles where active`,
    sql()`select count(*)::int as n from companies`,
  ]);
  const card = (n: string, title: string, desc: string, href: string, warn?: string) => (
    <div className="card">
      <div className="row">
        <b style={{ fontSize: 16 }}>
          {n} {title}
        </b>
      </div>
      <p className="muted">{desc}</p>
      {warn ? <p className="badge pending">{warn}</p> : null}
      <Link className="btn sm" href={href}>
        ไปที่การตั้งค่า
      </Link>
    </div>
  );
  return (
    <div className="cols">
      {card("1", "ข้อมูลพื้นฐานองค์กร", "ตั้งค่าข้อมูลของบริษัท โครงสร้างองค์กร ตำแหน่ง และเวิร์กโฟลว์ภายในระบบ", "/settings/companies", `${cos[0].n} บริษัท`)}
      {card(
        "2",
        "จัดการเวลาทำงาน",
        "ตั้งค่ากะการทำงาน สถานที่ลงเวลา ปฏิทินวันหยุด และประเภทการลา",
        "/settings/shifts",
        noShift[0].n ? `${noShift[0].n} พนักงานไม่มีกะทำงาน` : undefined,
      )}
      {card(
        "3",
        "เงินเดือนและสวัสดิการ",
        "จัดการประเภทการจ้าง งวดเงินเดือน รายได้ รายหัก และสวัสดิการ เพื่อรองรับการคำนวณและจ่ายเงินเดือน",
        "/settings/payroll-cycles",
        cycles[0].n ? undefined : "ยังไม่ได้กำหนดงวดเงินเดือน",
      )}
      {card("4", "จัดการระบบและสิทธิ์การใช้งาน", "จัดการสิทธิ์ผู้ใช้ การแจ้งเตือน ฟีเจอร์ และการนำเข้าข้อมูล", "/settings/users")}
      {noCal[0].n ? <p className="small muted">{noCal[0].n} พนักงานใช้ปฏิทินวันหยุดตั้งต้น</p> : null}
    </div>
  );
}
