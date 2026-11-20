"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Allow = Record<string, boolean>;

const GROUPS: { title: string; key: string; items: [string, string, string?][] }[] = [
  {
    title: "1 ข้อมูลพื้นฐานองค์กร",
    key: "org",
    items: [
      ["/settings/org", "1.1 ตั้งค่าระดับองค์กร"],
      ["/settings/companies", "1.2 ข้อมูลบริษัท"],
      ["/settings/units", "1.3 โครงสร้างองค์กร"],
      ["/settings/positions", "1.4 ตำแหน่ง"],
      ["/settings/master", "1.6 มาสเตอร์"],
      ["/settings/workflows", "1.7 เวิร์กโฟลว์"],
      ["/settings/announcements", "1.8 ประกาศ", "announcements"],
    ],
  },
  {
    title: "2 จัดการเวลาทำงาน",
    key: "time",
    items: [
      ["/settings/shifts", "2.1 กะการทำงาน"],
      ["/settings/locations", "2.2 สถานที่เวิร์กอิน"],
      ["/settings/calendars", "2.3 ปฏิทินวันหยุด"],
      ["/settings/leave-types", "2.4 ประเภทการลา"],
    ],
  },
  {
    title: "3 เงินเดือนและสวัสดิการ",
    key: "payroll",
    items: [
      ["/settings/employment-types", "3.1 ประเภทการจ้าง"],
      ["/settings/payroll-cycles", "3.2 กำหนดงวด"],
      ["/settings/pay-items", "3.3 รายได้ รายหัก"],
      ["/settings/welfare", "3.4 สวัสดิการ"],
      ["/settings/statutory", "3.5 ประกันสังคม / ภาษี / กองทุน"],
    ],
  },
  {
    title: "4 ระบบและสิทธิ์การใช้งาน",
    key: "system",
    items: [
      ["/settings/users", "4.1 สิทธิ์การใช้งาน"],
      ["/settings/import", "4.2 นำเข้าข้อมูล"],
      ["/settings/notifications", "4.4 การแจ้งเตือน"],
      ["/settings/features", "4.5 จัดการฟีเจอร์"],
      ["/settings/audit", "ประวัติการแก้ไข", "audit"],
    ],
  },
];

export default function SettingsNav({ allow }: { allow: Allow }) {
  const path = usePathname();
  return (
    <nav className="subnav">
      <Link href="/settings" className={path === "/settings" ? "on" : ""}>
        ภาพรวมการตั้งค่า
      </Link>
      {GROUPS.map((g) => {
        const items = g.items.filter(([, , k]) => allow[k || g.key]);
        if (!items.length) return null;
        return (
          <div key={g.key} style={{ display: "contents" }}>
            <div className="grp">{g.title}</div>
            {items.map(([href, label]) => (
              <Link key={href} href={href} className={path === href || path.startsWith(href + "/") ? "on" : ""}>
                {label}
              </Link>
            ))}
          </div>
        );
      })}
      {allow.learn && (
        <>
          <div className="grp">อื่นๆ</div>
          <Link href="/learn/manage" className={path.startsWith("/learn/manage") ? "on" : ""}>
            จัดการคอร์สเรียน
          </Link>
        </>
      )}
    </nav>
  );
}
