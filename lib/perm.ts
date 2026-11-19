// Permission catalog (กำหนดสิทธิ์ผู้ใช้งาน). Each feature has up to four actions.
export type Act = "view" | "create" | "edit" | "delete";

export const PERM_GROUPS: { group: string; items: { key: string; label: string; acts: Act[] }[] }[] = [
  {
    group: "ทั่วไป",
    items: [
      { key: "home", label: "หน้าแรก", acts: ["view"] },
      { key: "documents", label: "เอกสารของตนเอง (ลา, OT, รับรองเวลา ฯลฯ)", acts: ["view", "create", "edit", "delete"] },
      { key: "learn", label: "เรียนรู้ (เข้าเรียน)", acts: ["view"] },
    ],
  },
  {
    group: "ทีม",
    items: [
      { key: "team", label: "ทีม: ดูข้อมูลและอนุมัติเอกสารลูกทีม", acts: ["view", "create", "edit"] },
      { key: "team.actions", label: "การดำเนินการ (บรรจุ เลื่อนตำแหน่ง ปรับเงินเดือน โอนย้าย พ้นสภาพ)", acts: ["view", "create", "edit"] },
      { key: "documents.onbehalf", label: "สร้าง/ยกเลิกเอกสารแทนพนักงาน", acts: ["view", "create", "edit"] },
    ],
  },
  {
    group: "พนักงาน",
    items: [
      { key: "employees", label: "ข้อมูลพนักงาน", acts: ["view", "create", "edit", "delete"] },
      { key: "employees.personal", label: "ข้อมูลส่วนตัว / ติดต่อ / ครอบครัว / การศึกษา", acts: ["view", "edit"] },
      { key: "employees.salary", label: "ข้อมูลเงินเดือน ภาษี ประกันสังคม กองทุน", acts: ["view", "edit"] },
      { key: "employees.export", label: "ดาวน์โหลดข้อมูลพนักงาน", acts: ["view"] },
      { key: "org", label: "โครงสร้างองค์กร", acts: ["view", "create", "edit", "delete"] },
    ],
  },
  {
    group: "เงินเดือน",
    items: [{ key: "payroll", label: "งวดเงินเดือน", acts: ["view", "create", "edit"] }],
  },
  {
    group: "รายงาน",
    items: [
      { key: "dashboard", label: "แดชบอร์ด", acts: ["view"] },
      { key: "reports", label: "รายงาน", acts: ["view"] },
      { key: "audit", label: "ประวัติการแก้ไข", acts: ["view"] },
    ],
  },
  {
    group: "เรียนรู้และประกาศ",
    items: [
      { key: "learn.manage", label: "จัดการคอร์สเรียน", acts: ["view", "create", "edit", "delete"] },
      { key: "announcements", label: "ประกาศ / นโยบายบริษัท", acts: ["view", "create", "edit", "delete"] },
    ],
  },
  {
    group: "ตั้งค่า",
    items: [
      { key: "settings.org", label: "ข้อมูลพื้นฐานองค์กร", acts: ["view", "create", "edit", "delete"] },
      { key: "settings.time", label: "จัดการเวลาทำงาน", acts: ["view", "create", "edit", "delete"] },
      { key: "settings.payroll", label: "เงินเดือนและสวัสดิการ", acts: ["view", "create", "edit", "delete"] },
      { key: "settings.system", label: "ระบบและสิทธิ์การใช้งาน", acts: ["view", "create", "edit", "delete"] },
    ],
  },
];

export const PAYROLL_PERMS: { key: string; label: string; desc: string }[] = [
  { key: "calculate", label: "คำนวณเงินเดือน", desc: "เปลี่ยนแปลงและคำนวณเงินเดือนในงวด" },
  { key: "review", label: "ตรวจสอบเงินเดือน", desc: "ตรวจสอบเงินเดือนในงวด" },
  { key: "approve", label: "อนุมัติเงินเดือน", desc: "อนุมัติเงินเดือนในงวด" },
  { key: "close", label: "ปิดงวดเงินเดือน", desc: "ปิดงวดเงินเดือน" },
  { key: "pay", label: "ชำระงวดเงินเดือน", desc: "บันทึกการชำระเงินเดือน" },
  { key: "adjust", label: "ปรับปรุงรายการงวด", desc: "เพิ่ม/แก้ไขรายได้รายหักในงวด" },
  { key: "reverse", label: "ย้อนงวดหลังชำระเงิน", desc: "ย้อนสถานะงวดที่ชำระแล้ว" },
  { key: "delete_special", label: "ลบงวดพิเศษ", desc: "ลบงวดพิเศษ" },
];

/** Merge permissions of several roles into one map. */
export function mergePerms(list: any[]): Record<string, Set<Act>> {
  const out: Record<string, Set<Act>> = {};
  for (const p of list) {
    if (!p) continue;
    for (const [k, acts] of Object.entries(p)) {
      if (!out[k]) out[k] = new Set();
      for (const a of (acts as any[]) || []) out[k].add(a);
    }
  }
  return out;
}

export function hasPerm(perms: Record<string, Set<Act>>, key: string, act: Act = "view"): boolean {
  if (perms["*"]?.has(act)) return true;
  return !!perms[key]?.has(act);
}
