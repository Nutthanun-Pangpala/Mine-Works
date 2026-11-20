"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/team", label: "หน้าหลัก" },
  { href: "/team/approvals", label: "เอกสารรออนุมัติ" },
  { href: "/team/documents", label: "เอกสารพนักงาน" },
  { href: "/team/schedule", label: "ตารางการทำงาน" },
  { href: "/team/records", label: "เวลาทาบบัตร / ขาดลามาสาย" },
  { href: "/team/quotas", label: "สิทธิ์การลา" },
  { href: "/team/actions", label: "การดำเนินการ" },
];

export default function TeamTabs() {
  const path = usePathname();
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={path === t.href ? "on" : ""}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
