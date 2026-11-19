"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ProfileNav({ id, salary, account }: { id: number; salary: boolean; account: boolean }) {
  const path = usePathname();
  const items = [
    { href: `/employees/${id}`, label: "ภาพรวม" },
    { href: `/employees/${id}/personal`, label: "ข้อมูลส่วนตัว" },
    { href: `/employees/${id}/employment`, label: "การจ้างงาน" },
    { href: `/employees/${id}/time`, label: "เวิร์กอิน / สิทธิ์การลา" },
    { href: `/employees/${id}/documents`, label: "เอกสาร / ไฟล์แนบ" },
  ];
  if (salary) items.push({ href: `/employees/${id}/salary`, label: "ข้อมูลเงินเดือน" });
  if (account) items.push({ href: `/employees/${id}/account`, label: "ข้อมูลบัญชี" });
  return (
    <nav className="subnav">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={path === i.href ? "on" : ""}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
