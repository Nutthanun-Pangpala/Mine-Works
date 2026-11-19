export const TZ = "Asia/Bangkok";

export const ROLE_LABEL: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  hr: "ฝ่ายบุคคล",
  manager: "หัวหน้างาน",
  employee: "พนักงาน",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
};

export const EMP_TYPE: Record<string, string> = {
  fulltime: "ประจำ",
  probation: "ทดลองงาน",
  contract: "สัญญาจ้าง",
  parttime: "พาร์ทไทม์",
};

export const MESSAGES: Record<string, string> = {
  login: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  required: "กรุณากรอกข้อมูลที่จำเป็นให้ครบ",
  password: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร",
  wrongpassword: "รหัสผ่านปัจจุบันไม่ถูกต้อง",
  duplicate: "ข้อมูลซ้ำกับที่มีอยู่แล้ว (เช่น รหัสพนักงานหรืออีเมล)",
  failed: "บันทึกไม่สำเร็จ กรุณาลองใหม่",
  forbidden: "คุณไม่มีสิทธิ์ทำรายการนี้",
  invalid: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบวันที่และรายละเอียด",
  nodays: "ช่วงวันที่เลือกไม่มีวันทำงาน",
  overlap: "มีใบลาในช่วงวันดังกล่าวอยู่แล้ว",
  quota: "วันลาคงเหลือไม่พอ",
  inuse: "ลบไม่ได้ เพราะยังมีข้อมูลที่ใช้งานรายการนี้อยู่",
  nocheckin: "ยังไม่ได้ลงเวลาเข้างานวันนี้",
};

// YYYY-MM-DD in Bangkok time
export function todayBkk(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function monthBkk(): string {
  return todayBkk().slice(0, 7);
}

export function isDate(s: any): boolean {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function isMonth(s: any): boolean {
  return typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
}

// Haversine distance in metres
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
