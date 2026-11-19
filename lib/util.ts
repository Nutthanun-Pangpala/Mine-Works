export const TZ = "Asia/Bangkok";

/* ---------------- Dates (all as 'YYYY-MM-DD' strings in Bangkok time) ---------------- */

export function todayBkk(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
export function monthBkk(): string {
  return todayBkk().slice(0, 7);
}
export function nowTimeBkk(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}
export function isDate(s: any): boolean {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));
}
export function isMonth(s: any): boolean {
  return typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
}
export function isTime(s: any): boolean {
  return typeof s === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(s);
}
export function d2(n: number): string {
  return String(n).padStart(2, "0");
}
export function toUTC(date: string): number {
  return Date.parse(date + "T00:00:00Z");
}
export function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
export function addDays(date: string, n: number): string {
  return fromUTC(toUTC(date) + n * 86400000);
}
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}
export function weekday(date: string): number {
  return new Date(toUTC(date)).getUTCDay(); // 0 = Sunday
}
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function monthStart(ym: string): string {
  return ym + "-01";
}
export function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${d2(daysInMonth(y, m))}`;
}
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${d2((t % 12) + 1)}`;
}
export function timeToMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
}
export function minToTime(m: number): string {
  const x = ((m % 1440) + 1440) % 1440;
  return `${d2(Math.floor(x / 60))}:${d2(x % 60)}`;
}
/** Bangkok wall-clock date/time → UTC epoch ms */
export function bkkToMs(date: string, time: string): number {
  return Date.parse(`${date}T${time.length === 5 ? time + ":00" : time}+07:00`);
}
export function msToBkkDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ms));
}
export function msToBkkTime(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
}
export function age(birth: string | null | undefined, at = todayBkk()): number | null {
  if (!birth) return null;
  const b = String(birth).slice(0, 10);
  let a = Number(at.slice(0, 4)) - Number(b.slice(0, 4));
  if (at.slice(5) < b.slice(5)) a--;
  return a;
}
/** Tenure as {y,m,d} between two dates (inclusive of start). */
export function tenure(start: string | null | undefined, at = todayBkk()) {
  if (!start) return null;
  const s = String(start).slice(0, 10);
  if (s > at) return { y: 0, m: 0, d: 0, future: true };
  let y = Number(at.slice(0, 4)) - Number(s.slice(0, 4));
  let m = Number(at.slice(5, 7)) - Number(s.slice(5, 7));
  let d = Number(at.slice(8, 10)) - Number(s.slice(8, 10));
  if (d < 0) {
    m--;
    const pm = Number(at.slice(5, 7)) - 1 || 12;
    const py = pm === 12 ? Number(at.slice(0, 4)) - 1 : Number(at.slice(0, 4));
    d += daysInMonth(py, pm);
  }
  if (m < 0) {
    y--;
    m += 12;
  }
  return { y, m, d, future: false };
}
export function tenureText(start: string | null | undefined, at?: string): string {
  const t = tenure(start, at);
  if (!t) return "-";
  if (t.future) return "ยังไม่เริ่มงาน";
  const parts = [];
  if (t.y) parts.push(`${t.y} ปี`);
  if (t.m) parts.push(`${t.m} เดือน`);
  parts.push(`${t.d} วัน`);
  return parts.join(" ");
}
export function yearsOfService(start: string | null | undefined, at = todayBkk()): number {
  const t = tenure(start, at);
  if (!t || t.future) return 0;
  return t.y + t.m / 12 + t.d / 365;
}

/* ---------------- Formatting ---------------- */

const TH_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const TH_MON = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
export const TH_DOW = ["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."];

export function thMonth(m: number): string {
  return TH_MONTHS[m - 1] || "";
}
/** 01/02/2569 */
export function fd(date: any): string {
  if (!date) return "-";
  const s = date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
  if (!isDate(s)) return String(date);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${Number(s.slice(0, 4)) + 543}`;
}
/** 1 ก.พ. 2569 */
export function fdLong(date: any): string {
  if (!date) return "-";
  const s = String(date).slice(0, 10);
  if (!isDate(s)) return String(date);
  return `${Number(s.slice(8, 10))} ${TH_MON[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(0, 4)) + 543}`;
}
export function fdt(ts: any): string {
  if (!ts) return "-";
  const ms = ts instanceof Date ? ts.getTime() : Date.parse(String(ts));
  if (isNaN(ms)) return String(ts);
  return `${fd(msToBkkDate(ms))} ${msToBkkTime(ms)}`;
}
export function ftime(ts: any): string {
  if (!ts) return "-";
  const ms = ts instanceof Date ? ts.getTime() : Date.parse(String(ts));
  return isNaN(ms) ? String(ts).slice(0, 5) : msToBkkTime(ms);
}
export function money(n: any, digits = 2): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function num(n: any, digits = 0): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function minutesText(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} ชม. ${m} นาที` : `${h} ชม.`) : `${m} นาที`;
}
export function fullName(e: any): string {
  if (!e) return "-";
  return `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();
}

/* ---------------- Distance ---------------- */

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/* ---------------- Labels ---------------- */

export const EMP_STATUS: Record<string, string> = {
  pending: "รอเริ่มงาน",
  probation: "ทดลองงาน",
  confirmed: "บรรจุ",
  terminated: "พ้นสภาพ",
};

export const REQ_STATUS: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
};

export const DOC_TYPES: Record<string, string> = {
  leave: "ลางาน",
  offsite: "ปฏิบัติงานนอกสถานที่",
  swap: "แลกเวลา",
  certify: "รับรองเวลา",
  ot: "ขอทำงานล่วงเวลา",
  accumulate: "ขอสะสมเวลา",
  doc: "ขอเอกสาร",
  change_shift: "ขอเปลี่ยนกะ",
  swap_shift: "สลับกะ",
  warning: "หนังสือเตือน",
  action: "การดำเนินการ",
  welfare: "เบิกสวัสดิการ",
  expense: "เบิกค่าใช้จ่าย",
};

export const SELF_TYPES = ["leave", "offsite", "swap", "certify", "ot", "accumulate", "doc", "change_shift", "swap_shift", "welfare", "expense"];

export const ACTION_KINDS: Record<string, string> = {
  confirm: "บรรจุ",
  promote: "เลื่อนตำแหน่ง",
  salary_adjust: "ปรับเงินเดือน",
  change_supervisor: "ย้ายสายบังคับบัญชา",
  transfer_unit: "โอนย้ายหน่วยงาน",
  transfer_company: "โอนย้ายบริษัท",
  change_terms: "เปลี่ยนแปลงสภาพการจ้าง",
  terminate: "พ้นสภาพ",
  rehire: "รับกลับเข้าทำงานใหม่",
};

export const CERT_DOCS: Record<string, string> = {
  salary_cert: "หนังสือรับรองเงินเดือน",
  work_cert: "หนังสือรับรองการทำงาน",
  visa_cert: "หนังสือรับรองการทำงานเพื่อทำวีซ่า",
  tawi50: "หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)",
  payslip: "สลิปเงินเดือน",
};

export const WARNING_LEVELS: Record<string, string> = {
  verbal: "ตักเตือนด้วยวาจา",
  written1: "หนังสือเตือนครั้งที่ 1",
  written2: "หนังสือเตือนครั้งที่ 2",
  final: "หนังสือเตือนครั้งสุดท้าย",
};

export const PERIOD_STATUS: Record<string, string> = {
  draft: "รอคำนวณ",
  calculated: "คำนวณแล้ว",
  reviewed: "ตรวจสอบแล้ว",
  approved: "อนุมัติแล้ว",
  closed: "ปิดงวดแล้ว",
  paid: "ชำระแล้ว",
};

export const GENDER: Record<string, string> = { male: "ชาย", female: "หญิง", other: "อื่นๆ" };

export const PAY_TYPE: Record<string, string> = { monthly: "รายเดือน", daily: "รายวัน", hourly: "รายชั่วโมง" };

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
  overlap: "มีเอกสารในช่วงเวลาดังกล่าวอยู่แล้ว",
  quota: "สิทธิ์คงเหลือไม่พอ",
  inuse: "ลบไม่ได้ เพราะยังมีข้อมูลที่ใช้งานรายการนี้อยู่",
  nocheckin: "ยังไม่ได้ลงเวลาเข้างานวันนี้",
  backdate: "ไม่สามารถขอย้อนหลังเกินกำหนด",
  advance: "ประเภทนี้ไม่อนุญาตให้ขอล่วงหน้า",
  probation: "ต้องผ่านทดลองงานก่อนจึงจะใช้สิทธิ์นี้ได้",
  gender: "ประเภทนี้ไม่สามารถใช้ได้กับเพศของพนักงาน",
  attach: "ประเภทนี้ต้องแนบไฟล์",
  minimum: "ระยะเวลาน้อยกว่าขั้นต่ำที่กำหนด",
  once: "ประเภทนี้ใช้สิทธิ์ได้เพียงครั้งเดียว",
  consecutive: "เกินจำนวนวันที่ลาติดต่อกันได้",
  halfday: "ประเภทนี้ต้องลาอย่างน้อยครึ่งวัน",
  docs_per_day: "เกินจำนวนเอกสารต่อวันที่กำหนด",
  far: "อยู่นอกรัศมีสถานที่ลงเวลา",
  locked: "งวดนี้ถูกปิดแล้ว ไม่สามารถแก้ไขได้",
  state: "สถานะงวดไม่ถูกต้องสำหรับขั้นตอนนี้",
  nocycle: "ยังไม่ได้กำหนดงวดเงินเดือนสำหรับประเภทการจ้างนี้",
  filesize: "ไฟล์มีขนาดใหญ่เกิน 4 MB",
  setupdone: "ระบบถูกตั้งค่าแล้ว",
};
