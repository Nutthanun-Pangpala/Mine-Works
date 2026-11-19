import { requirePerm } from "@/lib/auth";
import { importClock, importEmployees, importLeaveQuota } from "@/app/actions/system";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";

export default async function Import({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.system");
  const tab = ["clock", "quota"].includes(sp.tab) ? sp.tab : "employees";
  return (
    <>
      <Notice sp={sp} />
      <Tabs
        small
        tabs={[
          { href: "/settings/import", label: "ข้อมูลพนักงาน", on: tab === "employees" },
          { href: "/settings/import?tab=clock", label: "เวลาทาบบัตร", on: tab === "clock" },
          { href: "/settings/import?tab=quota", label: "สิทธิ์การลา (กำหนดเอง)", on: tab === "quota" },
        ]}
      />
      {tab === "employees" && (
        <div className="card">
          <h2>นำเข้าข้อมูลพนักงาน</h2>
          <p className="muted small">
            ไฟล์ CSV (UTF-8) แถวแรกเป็นหัวคอลัมน์ ต้องมีอย่างน้อย code, first_name, last_name — รหัสที่มีอยู่แล้วจะถูกอัปเดต วันที่ใช้รูปแบบ YYYY-MM-DD (ค.ศ.)
          </p>
          <p>
            <a className="btn sm" href="/api/import-template">
              ดาวน์โหลดไฟล์ตัวอย่าง
            </a>
          </p>
          <form action={importEmployees} className="inline">
            <input type="file" name="file" accept=".csv,text/csv" required />
            <button className="btn primary">นำเข้าข้อมูล</button>
          </form>
        </div>
      )}
      {tab === "clock" && (
        <div className="card">
          <h2>นำเข้าเวลาทาบบัตร</h2>
          <p className="muted small">CSV: รหัสพนักงาน, วันเวลา (YYYY-MM-DD HH:MM) หรือ รหัสพนักงาน, วันที่, เวลา — 1 แถวต่อ 1 การทาบบัตร เช่น ไฟล์ส่งออกจากเครื่องสแกนนิ้ว (มีแถวหัวคอลัมน์หรือไม่ก็ได้)</p>
          <form action={importClock} className="inline">
            <input type="file" name="file" accept=".csv,text/csv" required />
            <button className="btn primary">นำเข้า</button>
          </form>
        </div>
      )}
      {tab === "quota" && (
        <div className="card">
          <h2>นำเข้าสิทธิ์การลา (กำหนดเอง)</h2>
          <p className="muted small">CSV: รหัสพนักงาน, รหัสประเภทการลา (เช่น L02), ปี ค.ศ., จำนวนวัน (มีแถวหัวคอลัมน์หรือไม่ก็ได้)</p>
          <form action={importLeaveQuota} className="inline">
            <input type="file" name="file" accept=".csv,text/csv" required />
            <button className="btn primary">นำเข้า</button>
          </form>
        </div>
      )}
    </>
  );
}
