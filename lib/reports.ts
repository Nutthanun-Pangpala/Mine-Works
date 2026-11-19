// Report catalogue (mirrors empeo report codes). Every report returns a plain table
// so it can be previewed on /reports/[code] and downloaded as CSV from /api/reports/[code].
import { sql } from "./db";
import { User, can, teamScope } from "./auth";
import { computeAttendance, dayLabel, summarize } from "./attendance";
import { quotasFor } from "./leave";
import {
  ACTION_KINDS, EMP_STATUS, GENDER, REQ_STATUS, WARNING_LEVELS, addDays, age, eachDay, fd, fdBkk, fdt, fullName, ftime,
  monthBkk, monthEnd, round2, tenureText, thMonth, todayBkk,
} from "./util";

export type Cell = string | number | null;
export type ReportResult = { cols: string[]; rows: Cell[][]; note?: string };
export type ReportParams = { from: string; to: string; month: string; year: number; period: number | null; company: number | null };
type Ctx = { p: ReportParams; ids: number[] | null; salary: boolean };
type ParamKind = "range" | "month" | "year" | "period";
export type ReportDef = {
  code: string;
  name: string;
  group: string;
  params: ParamKind[];
  payroll?: boolean; // needs payroll permission
  team?: boolean; // supervisors may run it for their own team
  run: (c: Ctx) => Promise<ReportResult>;
};

export const REPORT_GROUPS: Record<string, string> = {
  people: "ข้อมูลพนักงาน",
  time: "เวลาทำงาน",
  payroll: "เงินเดือน",
  fund: "ภาษี ประกันสังคม และกองทุน",
  welfare: "สวัสดิการและเอกสาร",
  learn: "การเรียนรู้",
};

const OT_KINDS: Record<string, string> = { ot1: "OT x1", ot2: "OT x1.5", ot3: "OT x2", ot4: "OT x3" };
const TAX_COND: Record<string, number> = { withhold: 1, company_always: 2, company_once: 3 };

const n2 = (v: any) => round2(Number(v || 0));
const hrs = (min: number) => round2(min / 60);

/* ---------------- shared queries ---------------- */

async function emps(c: Ctx, opt: { terminated?: boolean; where?: "pf" | "sso" } = {}) {
  const all = c.ids === null;
  return sql()`
    select e.*, e.start_date::text as sd, e.end_date::text as ed, e.birth_date::text as bd, e.confirm_date::text as cd,
           e.pf_join_date::text as pfd, ou.name as unit, ou.cost_center, pos.name as position, pl.name as level,
           co.name_th as company, b.name as branch, et.name as emp_type, sr.name as sep_reason, sup.first_name as sup_first, sup.last_name as sup_last
    from employees e
    left join org_units ou on ou.id = e.org_unit_id left join positions pos on pos.id = e.position_id
    left join position_levels pl on pl.id = pos.level_id left join companies co on co.id = e.company_id
    left join branches b on b.id = e.branch_id left join employment_types et on et.id = e.employment_type_id
    left join master_options sr on sr.id = e.separation_reason_id left join employees sup on sup.id = e.supervisor_id
    where (${all}::boolean or e.id = any(${c.ids ?? []}::int[]))
      and (${c.p.company}::int is null or e.company_id = ${c.p.company})
      and (${!!opt.terminated}::boolean or e.status <> 'terminated')
      and (${opt.where ?? ""} <> 'pf' or e.pf_enabled) and (${opt.where ?? ""} <> 'sso' or e.sso_enabled)
    order by e.code`;
}

async function attendanceRows(c: Ctx, from: string, to: string) {
  const list = (await emps(c)).filter((e: any) => e.status !== "pending");
  const att = await computeAttendance(list.map((e: any) => e.id), from, to);
  return { list, att };
}

/** Payroll lines in approved+ periods, optionally restricted to one period or one year (by pay date). */
async function lines(c: Ctx, by: { period?: number | null; year?: number }) {
  const all = c.ids === null;
  return sql()`
    select l.*, p.name as period, p.pay_date::text as pd, p.month, p.year, p.company_id, p.status as pstatus,
           e.code, e.title, e.first_name, e.last_name, e.national_id, e.bank_name, e.bank_account, e.payment_method,
           e.tax_method, e.address_registered, e.address_current, e.salary, e.pf_employee_rate, e.pf_employer_rate, e.sso_id,
           ou.name as unit, ou.cost_center, co.name_th as company
    from payroll_lines l join payroll_periods p on p.id = l.period_id join employees e on e.id = l.employee_id
    left join org_units ou on ou.id = e.org_unit_id left join companies co on co.id = p.company_id
    where (${all}::boolean or e.id = any(${c.ids ?? []}::int[]))
      and (${c.p.company}::int is null or p.company_id = ${c.p.company})
      and (${by.period ?? null}::int is null or p.id = ${by.period ?? null})
      and (${by.year ?? null}::int is null or (extract(year from p.pay_date) = ${by.year ?? null} and p.status in ('approved','closed','paid')))
    order by p.pay_date, e.code`;
}

function needPeriod(c: Ctx) {
  if (!c.p.period) throw new ReportError("กรุณาเลือกงวดเงินเดือน");
  return c.p.period;
}

export class ReportError extends Error {}

const nm = (e: any) => fullName(e);

/* ---------------- definitions ---------------- */

export const REPORTS: ReportDef[] = [
  // ---- people ----
  {
    code: "A001", name: "รายงานพนักงานลาออก/พ้นสภาพ", group: "people", params: ["range"],
    run: async (c) => {
      const rows = (await emps(c, { terminated: true })).filter((e: any) => e.status === "terminated" && e.ed && e.ed >= c.p.from && e.ed <= c.p.to);
      return {
        cols: ["รหัส", "ชื่อ-สกุล", "บริษัท", "หน่วยงาน", "ตำแหน่ง", "วันเริ่มงาน", "วันที่พ้นสภาพ", "อายุงาน", "เหตุผล", "หมายเหตุ"],
        rows: rows.map((e: any) => [e.code, nm(e), e.company, e.unit, e.position, fd(e.sd), fd(e.ed), tenureText(e.sd, e.ed), e.sep_reason, e.separation_note]),
      };
    },
  },
  {
    code: "A002", name: "รายงานการดำเนินการ (Action)", group: "people", params: ["range"],
    run: async (c) => {
      const all = c.ids === null;
      const rows = await sql()`
        select r.*, r.start_date::text as d, e.code, e.title, e.first_name, e.last_name from requests r join employees e on e.id = r.employee_id
        where r.doc_type = 'action' and r.start_date between ${c.p.from} and ${c.p.to} and r.status <> 'cancelled'
          and (${all}::boolean or e.id = any(${c.ids ?? []}::int[])) and (${c.p.company}::int is null or e.company_id = ${c.p.company})
        order by r.start_date, e.code`;
      return {
        cols: ["วันที่มีผล", "รหัส", "ชื่อ-สกุล", "การดำเนินการ", "รายละเอียด", "สถานะ", "ดำเนินการแล้ว"],
        rows: rows.map((r: any) => [fd(r.d), r.code, nm(r), ACTION_KINDS[r.payload?.kind] || r.payload?.kind, r.detail, REQ_STATUS[r.status], r.applied_at ? "ใช่" : "ยังไม่ถึงวันที่มีผล"]),
      };
    },
  },
  {
    code: "A003", name: "รายงานพนักงานเข้าใหม่", group: "people", params: ["range"],
    run: async (c) => {
      const rows = (await emps(c, { terminated: true })).filter((e: any) => e.sd && e.sd >= c.p.from && e.sd <= c.p.to);
      return {
        cols: ["รหัส", "ชื่อ-สกุล", "บริษัท", "หน่วยงาน", "ตำแหน่ง", "ประเภทการจ้าง", "วันเริ่มงาน", "ครบทดลองงาน", "หัวหน้า", "สถานะ"],
        rows: rows.map((e: any) => [e.code, nm(e), e.company, e.unit, e.position, e.emp_type, fd(e.sd), fd(e.probation_end_date), e.sup_first ? `${e.sup_first} ${e.sup_last}` : "", EMP_STATUS[e.status]]),
      };
    },
  },
  {
    code: "A012", name: "รายงานพนักงานผ่านทดลองงาน", group: "people", params: ["range"],
    run: async (c) => {
      const rows = (await emps(c, { terminated: true })).filter((e: any) => e.cd && e.cd >= c.p.from && e.cd <= c.p.to);
      return {
        cols: ["รหัส", "ชื่อ-สกุล", "หน่วยงาน", "ตำแหน่ง", "วันเริ่มงาน", "วันที่บรรจุ"],
        rows: rows.map((e: any) => [e.code, nm(e), e.unit, e.position, fd(e.sd), fd(e.cd)]),
      };
    },
  },
  {
    code: "A014", name: "รายงานวันเกิดพนักงาน", group: "people", params: ["month"],
    run: async (c) => {
      const m = Number(c.p.month.slice(5, 7));
      const y = Number(c.p.month.slice(0, 4));
      const rows = (await emps(c)).filter((e: any) => e.bd && Number(e.bd.slice(5, 7)) === m);
      rows.sort((a: any, b: any) => a.bd.slice(8).localeCompare(b.bd.slice(8)));
      return {
        cols: ["วันเกิด", "รหัส", "ชื่อ-สกุล", "ชื่อเล่น", "หน่วยงาน", "ตำแหน่ง", "อายุที่จะครบ"],
        rows: rows.map((e: any) => [fd(e.bd), e.code, nm(e), e.nickname, e.unit, e.position, y - Number(e.bd.slice(0, 4))]),
      };
    },
  },
  {
    code: "A017", name: "รายงานประวัติการเปลี่ยนแปลงข้อมูล", group: "people", params: ["range"],
    run: async (c) => {
      const all = c.ids === null;
      const rows = await sql()`
        select a.*, x.first_name as af, x.last_name as al, e.code, e.title, e.first_name, e.last_name
        from audit_logs a left join employees x on x.id = a.actor_id left join employees e on e.id = a.entity_id
        where a.entity = 'employee' and (a.created_at at time zone 'Asia/Bangkok')::date between ${c.p.from} and ${c.p.to}
          and (${all}::boolean or a.entity_id = any(${c.ids ?? []}::int[]))
        order by a.created_at`;
      return {
        cols: ["วันเวลา", "ผู้แก้ไข", "รหัส", "พนักงาน", "การกระทำ", "รายละเอียด"],
        rows: rows.map((r: any) => [fdt(r.created_at), r.af ? `${r.af} ${r.al}` : "ระบบ", r.code, r.first_name ? nm(r) : "", r.action, r.detail ? JSON.stringify(r.detail) : ""]),
      };
    },
  },
  {
    code: "A018", name: "รายงานจำนวนพนักงาน (Headcount)", group: "people", params: ["range"],
    run: async (c) => {
      const at = c.p.to;
      const list = (await emps(c, { terminated: true })).filter((e: any) => e.status !== "pending" && e.sd && e.sd <= at && (!e.ed || e.ed > at));
      const g = new Map<string, any>();
      for (const e of list) {
        const k = `${e.company}|${e.unit || "-"}`;
        const r = g.get(k) || { company: e.company, unit: e.unit || "-", total: 0, probation: 0, confirmed: 0, male: 0, female: 0, newIn: 0 };
        r.total++;
        if (e.cd && e.cd <= at) r.confirmed++;
        else r.probation++;
        if (e.gender === "male") r.male++;
        if (e.gender === "female") r.female++;
        if (e.sd >= c.p.from) r.newIn++;
        g.set(k, r);
      }
      const out = [...g.values()].sort((a, b) => (a.company + a.unit).localeCompare(b.company + b.unit));
      const left = (await emps(c, { terminated: true })).filter((e: any) => e.ed && e.ed >= c.p.from && e.ed <= c.p.to).length;
      return {
        cols: ["บริษัท", "หน่วยงาน", "ทั้งหมด", "ทดลองงาน", "บรรจุ", "ชาย", "หญิง", "เข้าใหม่ในช่วง"],
        rows: [
          ...out.map((r) => [r.company, r.unit, r.total, r.probation, r.confirmed, r.male, r.female, r.newIn]),
          ["รวม", "", list.length, out.reduce((a, r) => a + r.probation, 0), out.reduce((a, r) => a + r.confirmed, 0),
            out.reduce((a, r) => a + r.male, 0), out.reduce((a, r) => a + r.female, 0), out.reduce((a, r) => a + r.newIn, 0)],
        ],
        note: `ข้อมูล ณ วันที่ ${fd(at)} · ลาออกในช่วง ${left} คน`,
      };
    },
  },
  {
    code: "B014", name: "ทะเบียนลูกจ้าง", group: "people", params: [],
    run: async (c) => {
      const rows = await emps(c, { terminated: true });
      const cols = ["รหัส", "คำนำหน้า", "ชื่อ", "นามสกุล", "ชื่อ (EN)", "นามสกุล (EN)", "ชื่อเล่น", "เพศ", "วันเกิด", "อายุ", "สัญชาติ", "เลขบัตรประชาชน",
        "ที่อยู่ปัจจุบัน", "โทรศัพท์", "อีเมล", "บริษัท", "สาขา", "หน่วยงาน", "ตำแหน่ง", "ระดับ", "ประเภทการจ้าง", "วันเริ่มงาน", "วันบรรจุ",
        "วันสิ้นสุดการจ้าง", "สถานะ", "หัวหน้า"];
      if (c.salary) cols.push("ค่าจ้าง", "ธนาคาร", "เลขบัญชี");
      return {
        cols,
        rows: rows.map((e: any) => {
          const r: Cell[] = [e.code, e.title, e.first_name, e.last_name, e.first_name_en, e.last_name_en, e.nickname, GENDER[e.gender] || "", fd(e.bd), age(e.bd),
            e.nationality, e.national_id, e.address_current, e.mobile, e.work_email, e.company, e.branch, e.unit, e.position, e.level, e.emp_type,
            fd(e.sd), fd(e.cd), fd(e.ed), EMP_STATUS[e.status], e.sup_first ? `${e.sup_first} ${e.sup_last}` : ""];
          if (c.salary) r.push(n2(e.salary), e.bank_name, e.bank_account);
          return r;
        }),
      };
    },
  },
  // ---- time ----
  {
    code: "C003", name: "รายงานสรุปการเข้างาน", group: "time", params: ["range"], team: true,
    run: async (c) => attendanceSummary(c, c.p.from, c.p.to),
  },
  {
    code: "C004", name: "รายงานการเวิร์กอิน (ทาบบัตร)", group: "time", params: ["range"], team: true,
    run: async (c) => {
      const all = c.ids === null;
      const rows = await sql()`
        select r.*, e.code, e.title, e.first_name, e.last_name, w.name as loc from clock_records r join employees e on e.id = r.employee_id
        left join work_locations w on w.id = r.location_id
        where (r.ts at time zone 'Asia/Bangkok')::date between ${c.p.from} and ${c.p.to}
          and (${all}::boolean or e.id = any(${c.ids ?? []}::int[])) and (${c.p.company}::int is null or e.company_id = ${c.p.company})
        order by e.code, r.ts`;
      const SRC: Record<string, string> = { web: "เว็บ", mobile: "มือถือ", device: "เครื่องทาบบัตร", import: "นำเข้า", manual: "บันทึกโดย HR", certify: "รับรองเวลา" };
      return {
        cols: ["รหัส", "ชื่อ-สกุล", "วันที่", "เวลา", "ช่องทาง", "สถานที่", "ระยะห่าง (ม.)", "ละติจูด", "ลองจิจูด", "หมายเหตุ"],
        rows: rows.map((r: any) => [r.code, nm(r), fdBkk(r.ts), ftime(r.ts), SRC[r.source] || r.source, r.loc, r.distance_m, r.lat, r.lng, r.note]),
      };
    },
  },
  {
    code: "C006", name: "รายงานสรุปการทำงานประจำเดือน", group: "time", params: ["month"], team: true,
    run: async (c) => attendanceSummary(c, `${c.p.month}-01`, monthEnd(c.p.month)),
  },
  {
    code: "C007", name: "รายงานจำนวนครั้งขาด ลา มาสาย", group: "time", params: ["range"], team: true,
    run: async (c) => {
      const { list, att } = await attendanceRows(c, c.p.from, c.p.to);
      const types = new Set<string>();
      for (const days of att.values()) for (const d of days) for (const l of d.leaves) if (l.category === "leave") types.add(l.name);
      const tl = [...types].sort();
      return {
        cols: ["รหัส", "ชื่อ-สกุล", "หน่วยงาน", "ขาดงาน (วัน)", "มาสาย (ครั้ง)", "มาสาย (นาที)", "กลับก่อน (ครั้ง)", "กลับก่อน (นาที)", "ลืมทาบ (วัน)", ...tl.map((t) => `${t} (วัน)`), "ลารวม (วัน)"],
        rows: list.map((e: any) => {
          const days = att.get(e.id) || [];
          const s = summarize(days);
          const by = new Map<string, number>();
          for (const d of days) for (const l of d.leaves) if (l.category === "leave") by.set(l.name, (by.get(l.name) || 0) + l.days);
          return [e.code, nm(e), e.unit, s.absent_days, s.late_count, s.late_min, s.early_count, s.early_min, s.missing, ...tl.map((t) => round2(by.get(t) || 0)), round2(s.leave_days)];
        }),
      };
    },
  },
  {
    code: "C008", name: "รายงานสรุปการทำงานประจำปี", group: "time", params: ["year"], team: true,
    run: async (c) => {
      const y = c.p.year;
      const to = `${y}-12-31` < todayBkk() ? `${y}-12-31` : todayBkk();
      const { list, att } = await attendanceRows(c, `${y}-01-01`, to);
      const rows: Cell[][] = [];
      for (const e of list) {
        const days = att.get(e.id) || [];
        for (let m = 1; m <= 12; m++) {
          const ym = `${y}-${String(m).padStart(2, "0")}`;
          const md = days.filter((d) => d.date.startsWith(ym));
          if (!md.length) continue;
          const s = summarize(md);
          rows.push([e.code, nm(e), thMonth(m), s.work_days, s.present_days, s.absent_days, s.late_count, s.late_min, s.early_min, s.missing, round2(s.leave_days), hrs(s.worked_min)]);
        }
      }
      return { cols: ["รหัส", "ชื่อ-สกุล", "เดือน", "วันทำงาน", "มาทำงาน", "ขาด", "สาย (ครั้ง)", "สาย (นาที)", "กลับก่อน (นาที)", "ลืมทาบ", "ลา (วัน)", "ชั่วโมงทำงาน"], rows };
    },
  },
  {
    code: "C009", name: "รายงานข้อมูลการทำงานรายวัน", group: "time", params: ["range"], team: true,
    run: async (c) => {
      const { list, att } = await attendanceRows(c, c.p.from, c.p.to);
      const rows: Cell[][] = [];
      for (const e of list)
        for (const d of att.get(e.id) || []) {
          if (d.kind === "na") continue;
          rows.push([e.code, nm(e), fd(d.date), d.shift ? `${d.shift.code} ${d.shift.start}-${d.shift.end}` : "-", d.in_ms ? ftime(d.in_ms) : "", d.out_ms ? ftime(d.out_ms) : "",
            dayLabel(d).text, d.late_min || "", d.early_min || "", hrs(d.worked_min)]);
        }
      return { cols: ["รหัส", "ชื่อ-สกุล", "วันที่", "กะ", "เข้างาน", "ออกงาน", "สถานะ", "สาย (นาที)", "กลับก่อน (นาที)", "ชั่วโมงทำงาน"], rows };
    },
  },
  {
    code: "C010", name: "รายงานคะแนนการเข้างาน", group: "time", params: ["range"], team: true,
    run: async (c) => {
      const { list, att } = await attendanceRows(c, c.p.from, c.p.to);
      const rows = list.map((e: any) => {
        const s = summarize(att.get(e.id) || []);
        const score = Math.max(0, 100 - s.absent_days * 10 - s.late_count * 2 - s.early_count * 2 - s.missing);
        return [e.code, nm(e), e.unit, s.work_days, s.absent_days, s.late_count, s.early_count, s.missing, score] as Cell[];
      });
      rows.sort((a, b) => Number(b[8]) - Number(a[8]));
      return {
        cols: ["รหัส", "ชื่อ-สกุล", "หน่วยงาน", "วันทำงาน", "ขาด", "สาย (ครั้ง)", "กลับก่อน (ครั้ง)", "ลืมทาบ", "คะแนน"],
        rows,
        note: "คะแนน = 100 − ขาดงาน×10 − มาสาย×2 − กลับก่อน×2 − ลืมทาบ×1 (ต่ำสุด 0)",
      };
    },
  },
  {
    code: "C011", name: "รายงานการเข้า-ออกพื้นที่", group: "time", params: ["range"], team: true,
    run: async (c) => {
      const all = c.ids === null;
      const rows = await sql()`
        select (r.ts at time zone 'Asia/Bangkok')::date::text as d, e.code, e.title, e.first_name, e.last_name, w.name as loc, w.radius_m,
               min(r.ts) as first_ts, max(r.ts) as last_ts, count(*)::int as n, max(r.distance_m) as max_dist
        from clock_records r join employees e on e.id = r.employee_id left join work_locations w on w.id = r.location_id
        where (r.ts at time zone 'Asia/Bangkok')::date between ${c.p.from} and ${c.p.to}
          and (${all}::boolean or e.id = any(${c.ids ?? []}::int[])) and (${c.p.company}::int is null or e.company_id = ${c.p.company})
        group by 1, e.code, e.title, e.first_name, e.last_name, w.name, w.radius_m order by e.code, 1`;
      return {
        cols: ["รหัส", "ชื่อ-สกุล", "วันที่", "สถานที่", "เข้าพื้นที่", "ออกพื้นที่", "จำนวนครั้ง", "ระยะไกลสุด (ม.)", "อยู่ในรัศมี"],
        rows: rows.map((r: any) => [r.code, nm(r), fd(r.d), r.loc || "ไม่ระบุ", ftime(r.first_ts), r.n > 1 ? ftime(r.last_ts) : "", r.n, r.max_dist,
          r.max_dist == null || !r.radius_m ? "-" : r.max_dist <= r.radius_m ? "ใช่" : "นอกพื้นที่"]),
      };
    },
  },
  {
    code: "C012", name: "รายงานประจำวัน (Daily report)", group: "time", params: ["range"], team: true,
    run: async (c) => {
      const all = c.ids === null;
      const rows = await sql()`
        select d.*, d.report_date::text as rd, e.code, e.title, e.first_name, e.last_name from daily_reports d join employees e on e.id = d.employee_id
        where d.report_date between ${c.p.from} and ${c.p.to} and (${all}::boolean or e.id = any(${c.ids ?? []}::int[]))
        order by d.report_date, e.code`;
      return { cols: ["วันที่", "รหัส", "ชื่อ-สกุล", "อารมณ์ (1-5)", "รายงาน"], rows: rows.map((r: any) => [fd(r.rd), r.code, nm(r), r.mood, r.body]) };
    },
  },
  {
    code: "OT001", name: "รายงานสรุปการทำงานล่วงเวลา (OT)", group: "time", params: ["range"], team: true,
    run: async (c) => {
      const all = c.ids === null;
      const rows = await sql()`
        select e.code, e.title, e.first_name, e.last_name, ou.name as unit, r.payload->>'ot_kind' as k, sum(r.minutes)::int as m, count(*)::int as n
        from requests r join employees e on e.id = r.employee_id left join org_units ou on ou.id = e.org_unit_id
        where r.doc_type = 'ot' and r.status = 'approved' and r.start_date between ${c.p.from} and ${c.p.to}
          and (${all}::boolean or e.id = any(${c.ids ?? []}::int[])) and (${c.p.company}::int is null or e.company_id = ${c.p.company})
        group by e.code, e.title, e.first_name, e.last_name, ou.name, r.payload->>'ot_kind' order by e.code`;
      const by = new Map<string, any>();
      for (const r of rows) {
        const x = by.get(r.code) || { r, n: 0, total: 0, k: {} as Record<string, number> };
        x.n += r.n;
        x.total += r.m;
        x.k[r.k || "ot2"] = (x.k[r.k || "ot2"] || 0) + r.m;
        by.set(r.code, x);
      }
      const ks = Object.keys(OT_KINDS);
      return {
        cols: ["รหัส", "ชื่อ-สกุล", "หน่วยงาน", "จำนวนเอกสาร", ...ks.map((k) => `${OT_KINDS[k]} (ชม.)`), "รวม (ชม.)"],
        rows: [...by.values()].map((x) => [x.r.code, nm(x.r), x.r.unit, x.n, ...ks.map((k) => hrs(x.k[k] || 0)), hrs(x.total)]),
      };
    },
  },
  // ---- leave / benefits ----
  {
    code: "B013", name: "รายงานสิทธิ์การลา", group: "welfare", params: ["year"], team: true,
    run: async (c) => {
      const at = `${c.p.year}-12-31` < todayBkk() ? `${c.p.year}-12-31` : todayBkk() < `${c.p.year}-01-01` ? `${c.p.year}-01-01` : todayBkk();
      const list = (await emps(c)).filter((e: any) => e.status !== "pending");
      const rows: Cell[][] = [];
      for (const e of list) {
        const qs = await quotasFor(e.id, at, "leave");
        for (const q of qs)
          rows.push([e.code, nm(e), q.name, q.entitled == null ? "ไม่จำกัด" : q.entitled, q.carried, q.used, q.pending, q.remaining == null ? "ไม่จำกัด" : q.remaining, q.unit === "hour" ? "ชั่วโมง" : "วัน"]);
      }
      return { cols: ["รหัส", "ชื่อ-สกุล", "ประเภทการลา", "สิทธิ์", "ยกมา", "ใช้ไป", "รออนุมัติ", "คงเหลือ", "หน่วย"], rows, note: `ข้อมูล ณ วันที่ ${fd(at)}` };
    },
  },
  {
    code: "W005", name: "รายงานการผ่อนชำระ (ภาระหนี้สิน)", group: "welfare", params: [], payroll: true,
    run: async (c) => {
      const all = c.ids === null;
      const rows = await sql()`
        select li.*, li.start_date::text as sd, e.code, e.title, e.first_name, e.last_name,
          (select coalesce(sum(x.amount),0) from payroll_line_items x join payroll_lines pl on pl.id = x.line_id join payroll_periods pp on pp.id = pl.period_id
           where x.note = 'liab:' || li.id and pp.status in ('approved','closed','paid')) as paid
        from liabilities li join employees e on e.id = li.employee_id
        where (${all}::boolean or e.id = any(${c.ids ?? []}::int[])) and (${c.p.company}::int is null or e.company_id = ${c.p.company})
        order by e.code, li.start_date`;
      const K: Record<string, string> = { loan: "เงินกู้", advance: "เงินเบิกล่วงหน้า", legal_execution: "กรมบังคับคดี", student_loan: "กยศ./กรอ.", other: "อื่นๆ" };
      return {
        cols: ["รหัส", "ชื่อ-สกุล", "ประเภท", "อ้างอิง", "วันที่เริ่ม", "ยอดรวม", "ผ่อนต่องวด", "ชำระแล้ว", "คงเหลือ", "สถานะ"],
        rows: rows.map((r: any) => [r.code, nm(r), K[r.kind] || r.kind, r.reference, fd(r.sd), r.total == null ? "" : n2(r.total), n2(r.installment), n2(r.paid),
          r.total == null ? "" : n2(Number(r.total) - Number(r.paid)), r.active ? "กำลังผ่อน" : "ปิดแล้ว"]),
      };
    },
  },
  {
    code: "W007", name: "รายงานการใช้สวัสดิการและเบิกค่าใช้จ่าย", group: "welfare", params: ["range"],
    run: async (c) => {
      const all = c.ids === null;
      const rows = await sql()`
        select r.*, r.start_date::text as d, e.code, e.title, e.first_name, e.last_name, w.name as wname
        from requests r join employees e on e.id = r.employee_id left join welfare_types w on w.id = r.sub_type_id and r.doc_type = 'welfare'
        where r.doc_type in ('welfare','expense') and r.start_date between ${c.p.from} and ${c.p.to} and r.status <> 'cancelled'
          and (${all}::boolean or e.id = any(${c.ids ?? []}::int[])) and (${c.p.company}::int is null or e.company_id = ${c.p.company})
        order by r.start_date, e.code`;
      return {
        cols: ["วันที่", "รหัส", "ชื่อ-สกุล", "ประเภทเอกสาร", "สวัสดิการ/หมวด", "จำนวนเงิน", "รายละเอียด", "สถานะ"],
        rows: rows.map((r: any) => [fd(r.d), r.code, nm(r), r.doc_type === "welfare" ? "เบิกสวัสดิการ" : "เบิกค่าใช้จ่าย", r.wname || r.payload?.category, n2(r.amount), r.detail, REQ_STATUS[r.status]]),
      };
    },
  },
  {
    code: "WL001", name: "รายงานหนังสือเตือน", group: "welfare", params: ["range"],
    run: async (c) => {
      const all = c.ids === null;
      const rows = await sql()`
        select r.*, r.start_date::text as d, e.code, e.title, e.first_name, e.last_name, mo.name as reason, ou.name as unit
        from requests r join employees e on e.id = r.employee_id left join master_options mo on mo.id = r.reason_id left join org_units ou on ou.id = e.org_unit_id
        where r.doc_type = 'warning' and r.start_date between ${c.p.from} and ${c.p.to} and r.status <> 'cancelled'
          and (${all}::boolean or e.id = any(${c.ids ?? []}::int[])) and (${c.p.company}::int is null or e.company_id = ${c.p.company})
        order by r.start_date, e.code`;
      return {
        cols: ["วันที่", "รหัส", "ชื่อ-สกุล", "หน่วยงาน", "ระดับ", "เรื่อง", "รายละเอียด", "สถานะ"],
        rows: rows.map((r: any) => [fd(r.d), r.code, nm(r), r.unit, WARNING_LEVELS[r.payload?.level] || "", r.reason, r.detail, REQ_STATUS[r.status]]),
      };
    },
  },
  // ---- payroll ----
  {
    code: "P011", name: "รายงานการจ่ายเงินเดือน (โอนเงิน)", group: "payroll", params: ["period"], payroll: true,
    run: async (c) => {
      const ls = await lines(c, { period: needPeriod(c) });
      return {
        cols: ["ลำดับ", "รหัส", "ชื่อ-สกุล", "ช่องทาง", "ธนาคาร", "เลขที่บัญชี", "ยอดสุทธิ"],
        rows: [
          ...ls.map((l: any, i: number) => [i + 1, l.code, nm(l), l.payment_method === "cash" ? "เงินสด" : "โอนธนาคาร", l.bank_name, l.bank_account, n2(l.net)]),
          ["", "", "รวม", "", "", "", n2(ls.reduce((a: number, l: any) => a + Number(l.net), 0))],
        ],
      };
    },
  },
  {
    code: "P012", name: "รายงานเงินเดือนแยกตามหน่วยงาน", group: "payroll", params: ["period"], payroll: true,
    run: async (c) => groupLines(await lines(c, { period: needPeriod(c) }), (l) => l.unit || "-", "หน่วยงาน"),
  },
  {
    code: "P013", name: "รายงานเงินเดือนแยกตามศูนย์ต้นทุน", group: "payroll", params: ["period"], payroll: true,
    run: async (c) => groupLines(await lines(c, { period: needPeriod(c) }), (l) => l.cost_center || "ไม่ระบุ", "ศูนย์ต้นทุน"),
  },
  {
    code: "P016", name: "รายงานการปรับเงินเดือน", group: "payroll", params: ["range"], payroll: true,
    run: async (c) => {
      const all = c.ids === null;
      const rows = await sql()`
        select h.*, h.effective_date::text as d, e.code, e.title, e.first_name, e.last_name from salary_history h join employees e on e.id = h.employee_id
        where h.effective_date between ${c.p.from} and ${c.p.to} and (${all}::boolean or e.id = any(${c.ids ?? []}::int[]))
          and (${c.p.company}::int is null or e.company_id = ${c.p.company})
        order by h.effective_date, e.code`;
      return {
        cols: ["วันที่มีผล", "รหัส", "ชื่อ-สกุล", "ประเภท", "การดำเนินการ", "ก่อนปรับ", "หลังปรับ", "เปลี่ยนแปลง", "%", "หมายเหตุ"],
        rows: rows.map((r: any) => {
          const b = Number(r.amount_before || 0);
          const a = Number(r.amount_after || 0);
          return [fd(r.d), r.code, nm(r), r.kind === "bonus" ? "โบนัส" : "เงินเดือน", ACTION_KINDS[r.action] || r.action, n2(b), n2(a), n2(a - b), b ? round2(((a - b) / b) * 100) : "", r.note];
        }),
      };
    },
  },
  {
    code: "P018", name: "รายงานตรวจสอบเงินเดือน (เทียบงวดก่อน)", group: "payroll", params: ["period"], payroll: true,
    run: async (c) => {
      const pid = needPeriod(c);
      const cur = (await sql()`select * from payroll_periods where id = ${pid}`)[0];
      const prev = cur
        ? (
            await sql()`select id, name from payroll_periods where company_id = ${cur.company_id} and employment_type_id is not distinct from ${cur.employment_type_id}
                      and is_special = false and id <> ${pid} and pay_date < ${cur.pay_date} order by pay_date desc limit 1`
          )[0]
        : null;
      const a = await lines(c, { period: pid });
      const b = prev ? await lines(c, { period: prev.id }) : [];
      const bm = new Map(b.map((l: any) => [l.employee_id, l]));
      const am = new Map(a.map((l: any) => [l.employee_id, l]));
      const rows: Cell[][] = a.map((l: any) => {
        const p: any = bm.get(l.employee_id);
        const diff = Number(l.net) - Number(p?.net || 0);
        return [l.code, nm(l), p ? n2(p.gross) : "", n2(l.gross), p ? n2(p.net) : "", n2(l.net), n2(diff), p && Number(p.net) ? round2((diff / Number(p.net)) * 100) : "",
          !p ? "เข้าใหม่/ไม่มีในงวดก่อน" : Math.abs(diff) > Number(p.net) * 0.2 ? "ต่างเกิน 20%" : ""];
      });
      for (const p of b) if (!am.has(p.employee_id)) rows.push([p.code, nm(p), n2(p.gross), "", n2(p.net), "", n2(-Number(p.net)), "", "ไม่มีในงวดนี้"]);
      return {
        cols: ["รหัส", "ชื่อ-สกุล", "รายได้งวดก่อน", "รายได้งวดนี้", "สุทธิงวดก่อน", "สุทธิงวดนี้", "ผลต่าง", "%", "ข้อสังเกต"],
        rows,
        note: prev ? `เทียบกับ ${prev.name}` : "ไม่พบงวดก่อนหน้า",
      };
    },
  },
  {
    code: "P019", name: "สมุดบัญชีเงินเดือนแยกหน่วยงาน (รายปี)", group: "payroll", params: ["year"], payroll: true,
    run: async (c) => {
      const ls = await lines(c, { year: c.p.year });
      const g = new Map<string, number[]>();
      for (const l of ls) {
        const k = l.unit || "-";
        const arr = g.get(k) || Array(12).fill(0);
        arr[Number(l.pd.slice(5, 7)) - 1] += Number(l.gross);
        g.set(k, arr);
      }
      const rows: Cell[][] = [...g.entries()].sort().map(([k, arr]) => [k, ...arr.map(n2), n2(arr.reduce((a, b) => a + b, 0))]);
      return { cols: ["หน่วยงาน", ...Array.from({ length: 12 }, (_, i) => thMonth(i + 1)), "รวม"], rows, note: "ยอดรายได้รวม (Gross) ตามวันที่จ่าย" };
    },
  },
  {
    code: "P020", name: "รายงานค่าใช้จ่ายเงินเดือนรายงวดแยกบริษัท", group: "payroll", params: ["year"], payroll: true,
    run: async (c) => {
      const rows = await sql()`
        select co.name_th as company, p.name, p.pay_date::text as pd, count(l.id)::int as n, coalesce(sum(l.gross),0) as gross,
               coalesce(sum(l.sso_employer),0) as sso, coalesce(sum(l.pf_employer),0) as pf, coalesce(sum(l.ewf_employer),0) as ewf, coalesce(sum(l.net),0) as net
        from payroll_periods p join companies co on co.id = p.company_id left join payroll_lines l on l.period_id = p.id
        where extract(year from p.pay_date) = ${c.p.year} and p.status in ('approved','closed','paid') and (${c.p.company}::int is null or p.company_id = ${c.p.company})
        group by co.name_th, p.id, p.name, p.pay_date order by p.pay_date, co.name_th`;
      return {
        cols: ["บริษัท", "งวด", "วันที่จ่าย", "จำนวนคน", "รายได้รวม", "ปกส. นายจ้าง", "PF นายจ้าง", "กองทุนสงเคราะห์ฯ นายจ้าง", "ต้นทุนรวม", "จ่ายสุทธิ"],
        rows: rows.map((r: any) => [r.company, r.name, fd(r.pd), r.n, n2(r.gross), n2(r.sso), n2(r.pf), n2(r.ewf), n2(Number(r.gross) + Number(r.sso) + Number(r.pf) + Number(r.ewf)), n2(r.net)]),
      };
    },
  },
  // ---- tax / sso / funds ----
  {
    code: "P006", name: "รายการหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)", group: "fund", params: ["year"], payroll: true,
    run: async (c) => {
      const t = await annualTax(c);
      return {
        cols: ["รหัส", "ชื่อ-สกุล", "เลขประจำตัวผู้เสียภาษี", "เงินได้ทั้งปี", "ภาษีหัก ณ ที่จ่าย", "ประกันสังคม", "กองทุนสำรองฯ", "ลิงก์พิมพ์"],
        rows: t.map((r: any) => [r.code, nm(r), r.national_id, n2(r.income), n2(r.tax), n2(r.sso), n2(r.pf), `/print/tawi50/${r.employee_id}?year=${c.p.year}`]),
      };
    },
  },
  {
    code: "P007", name: "แบบ กท.20ก (ค่าจ้างประจำปี กองทุนเงินทดแทน)", group: "fund", params: ["year"], payroll: true,
    run: async (c) => {
      const ls = (await lines(c, { year: c.p.year })).filter((l: any) => l);
      const per = new Map<number, number>();
      const months = Array.from({ length: 12 }, () => ({ n: new Set<number>(), wage: 0 }));
      for (const l of ls) {
        const m = Number(l.pd.slice(5, 7)) - 1;
        months[m].n.add(l.employee_id);
        months[m].wage += Number(l.gross);
        per.set(l.employee_id, (per.get(l.employee_id) || 0) + Number(l.gross));
      }
      const capped = [...per.values()].reduce((a, v) => a + Math.min(v, 240000), 0);
      return {
        cols: ["เดือน", "จำนวนลูกจ้าง", "ค่าจ้างรวม"],
        rows: [...months.map((m, i) => [thMonth(i + 1), m.n.size, n2(m.wage)]), ["รวมทั้งปี (เพดาน 240,000 บาท/คน/ปี)", per.size, n2(capped)]],
        note: "ค่าจ้างคำนวณจากรายได้รวมของงวดที่อนุมัติแล้ว ตรวจสอบรายการที่ไม่ถือเป็นค่าจ้างก่อนยื่นแบบ",
      };
    },
  },
  {
    code: "P014", name: "ภ.ง.ด.1ก (สรุปภาษีหัก ณ ที่จ่ายประจำปี)", group: "fund", params: ["year"], payroll: true,
    run: async (c) => {
      const t = await annualTax(c);
      return {
        cols: ["ลำดับ", "เลขประจำตัวผู้เสียภาษี", "คำนำหน้า", "ชื่อ", "นามสกุล", "ที่อยู่", "เงินได้ทั้งปี", "ภาษีที่หักนำส่ง", "เงื่อนไข"],
        rows: t.map((r: any, i: number) => [i + 1, r.national_id, r.title, r.first_name, r.last_name, r.address_registered || r.address_current, n2(r.income), n2(r.tax), TAX_COND[r.tax_method] || 1]),
      };
    },
  },
  {
    code: "P015", name: "สรุปการยื่น ภ.ง.ด.1 รายเดือน", group: "fund", params: ["year"], payroll: true,
    run: async (c) => {
      const ls = await lines(c, { year: c.p.year });
      const m = Array.from({ length: 12 }, () => ({ n: new Set<number>(), income: 0, tax: 0 }));
      for (const l of ls) {
        const i = Number(l.pd.slice(5, 7)) - 1;
        m[i].n.add(l.employee_id);
        m[i].income += Number(l.taxable);
        m[i].tax += Number(l.tax);
      }
      return {
        cols: ["เดือนที่จ่าย", "จำนวนราย", "เงินได้", "ภาษีที่หักนำส่ง"],
        rows: [...m.map((x, i) => [thMonth(i + 1), x.n.size, n2(x.income), n2(x.tax)]),
          ["รวม", "", n2(m.reduce((a, x) => a + x.income, 0)), n2(m.reduce((a, x) => a + x.tax, 0))]],
      };
    },
  },
  {
    code: "SS001", name: "ข้อมูลเงินสมทบประกันสังคม (สปส.1-10)", group: "fund", params: ["period"], payroll: true,
    run: async (c) => {
      const ls = (await lines(c, { period: needPeriod(c) })).filter((l: any) => Number(l.sso_employee) > 0 || Number(l.sso_employer) > 0);
      return {
        cols: ["ลำดับ", "เลขประจำตัวประชาชน", "คำนำหน้า", "ชื่อ", "นามสกุล", "ค่าจ้าง", "เงินสมทบลูกจ้าง", "เงินสมทบนายจ้าง"],
        rows: [
          ...ls.map((l: any, i: number) => [i + 1, l.sso_id || l.national_id, l.title, l.first_name, l.last_name, n2(l.sso_base), n2(l.sso_employee), n2(l.sso_employer)]),
          ["", "", "", "รวม", "", n2(ls.reduce((a: number, l: any) => a + Number(l.sso_base), 0)), n2(ls.reduce((a: number, l: any) => a + Number(l.sso_employee), 0)),
            n2(ls.reduce((a: number, l: any) => a + Number(l.sso_employer), 0))],
        ],
      };
    },
  },
  {
    code: "P023", name: "รายงานแจ้งลูกจ้างสิ้นสุดความเป็นผู้ประกันตน (สปส.6-09)", group: "fund", params: ["range"],
    run: async (c) => {
      const rows = (await emps(c, { terminated: true, where: "sso" })).filter((e: any) => e.status === "terminated" && e.ed && e.ed >= c.p.from && e.ed <= c.p.to);
      return {
        cols: ["เลขประจำตัวประชาชน", "คำนำหน้า", "ชื่อ", "นามสกุล", "วันที่สิ้นสุดการจ้าง", "สาเหตุ"],
        rows: rows.map((e: any) => [e.sso_id || e.national_id, e.title, e.first_name, e.last_name, fd(e.ed), e.sso_end_reason || e.sep_reason]),
      };
    },
  },
  {
    code: "P017", name: "รายงานกองทุนสำรองเลี้ยงชีพ", group: "fund", params: ["period"], payroll: true,
    run: async (c) => {
      const ls = (await lines(c, { period: needPeriod(c) })).filter((l: any) => Number(l.pf_employee) > 0 || Number(l.pf_employer) > 0);
      return {
        cols: ["รหัส", "เลขประจำตัวประชาชน", "ชื่อ-สกุล", "ค่าจ้าง", "อัตราสะสม %", "เงินสะสม", "อัตราสมทบ %", "เงินสมทบ"],
        rows: ls.map((l: any) => [l.code, l.national_id, nm(l), n2(l.salary), n2(l.pf_employee_rate), n2(l.pf_employee), n2(l.pf_employer_rate), n2(l.pf_employer)]),
      };
    },
  },
  {
    code: "B012", name: "รายงานสมาชิกกองทุนสำรองเลี้ยงชีพ", group: "fund", params: ["year"], payroll: true,
    run: async (c) => {
      const list = await emps(c, { where: "pf" });
      const ls = await lines(c, { year: c.p.year });
      const sum = (id: number, k: string) => ls.filter((l: any) => l.employee_id === id).reduce((a: number, l: any) => a + Number(l[k]), 0);
      return {
        cols: ["รหัส", "ชื่อ-สกุล", "เลขประจำตัวประชาชน", "วันเข้ากองทุน", "อัตราสะสม %", "อัตราสมทบ %", "เงินสะสมทั้งปี", "เงินสมทบทั้งปี"],
        rows: list.map((e: any) => [e.code, nm(e), e.national_id, fd(e.pfd), n2(e.pf_employee_rate), n2(e.pf_employer_rate), n2(sum(e.id, "pf_employee")), n2(sum(e.id, "pf_employer"))]),
      };
    },
  },
  {
    code: "B011", name: "รายงานสมาชิกกองทุนสำรองเลี้ยงชีพที่ลาออก", group: "fund", params: ["range"], payroll: true,
    run: async (c) => {
      const list = (await emps(c, { terminated: true, where: "pf" })).filter((e: any) => e.status === "terminated" && e.ed && e.ed >= c.p.from && e.ed <= c.p.to);
      const ids = list.map((e: any) => e.id);
      const sums = ids.length
        ? await sql()`select employee_id, sum(pf_employee) as ee, sum(pf_employer) as er from payroll_lines l join payroll_periods p on p.id = l.period_id
                      where employee_id = any(${ids}::int[]) and p.status in ('approved','closed','paid') group by employee_id`
        : [];
      return {
        cols: ["รหัส", "ชื่อ-สกุล", "เลขประจำตัวประชาชน", "วันเข้ากองทุน", "วันที่ลาออก", "อายุงาน", "เงินสะสมรวม", "เงินสมทบรวม"],
        rows: list.map((e: any) => {
          const s = sums.find((x: any) => x.employee_id === e.id) || {};
          return [e.code, nm(e), e.national_id, fd(e.pfd), fd(e.ed), tenureText(e.sd, e.ed), n2(s.ee), n2(s.er)];
        }),
      };
    },
  },
  {
    code: "P021", name: "รายงานกองทุนสงเคราะห์ลูกจ้าง", group: "fund", params: ["period"], payroll: true,
    run: async (c) => {
      const ls = (await lines(c, { period: needPeriod(c) })).filter((l: any) => Number(l.ewf_employee) > 0 || Number(l.ewf_employer) > 0);
      return {
        cols: ["รหัส", "เลขประจำตัวประชาชน", "ชื่อ-สกุล", "เงินสะสมลูกจ้าง", "เงินสมทบนายจ้าง"],
        rows: ls.map((l: any) => [l.code, l.national_id, nm(l), n2(l.ewf_employee), n2(l.ewf_employer)]),
      };
    },
  },
  // ---- learn ----
  {
    code: "LRN001", name: "รายงานการเรียนรู้", group: "learn", params: [], team: true,
    run: async (c) => {
      const all = c.ids === null;
      const rows = await sql()`
        select co.title, mo.name as cat, en.status, en.score, en.completed_at, e.code, e.title as etitle, e.first_name, e.last_name
        from course_enrollments en join courses co on co.id = en.course_id join employees e on e.id = en.employee_id
        left join master_options mo on mo.id = co.category_id
        where (${all}::boolean or e.id = any(${c.ids ?? []}::int[])) order by co.title, e.code`;
      const S: Record<string, string> = { assigned: "ยังไม่เริ่ม", in_progress: "กำลังเรียน", completed: "เรียนจบ" };
      return {
        cols: ["หลักสูตร", "หมวดหมู่", "รหัส", "ชื่อ-สกุล", "สถานะ", "คะแนน", "วันที่เรียนจบ"],
        rows: rows.map((r: any) => [r.title, r.cat, r.code, `${r.etitle || ""}${r.first_name} ${r.last_name}`, S[r.status], r.score, r.completed_at ? fdBkk(r.completed_at) : ""]),
      };
    },
  },
];

/* ---------------- helpers ---------------- */

async function attendanceSummary(c: Ctx, from: string, to: string): Promise<ReportResult> {
  const { list, att } = await attendanceRows(c, from, to);
  return {
    cols: ["รหัส", "ชื่อ-สกุล", "หน่วยงาน", "วันทำงาน", "มาทำงาน", "ขาดงาน", "สาย (ครั้ง)", "สาย (นาที)", "กลับก่อน (ครั้ง)", "กลับก่อน (นาที)",
      "ลืมทาบ", "ลา (วัน)", "ลาไม่รับค่าจ้าง (วัน)", "วันหยุด", "ชั่วโมงทำงาน"],
    rows: list.map((e: any) => {
      const s = summarize(att.get(e.id) || []);
      return [e.code, nm(e), e.unit, s.work_days, s.present_days, s.absent_days, s.late_count, s.late_min, s.early_count, s.early_min, s.missing,
        round2(s.leave_days), round2(s.unpaid_leave_days), s.holiday_days + s.off_days, hrs(s.worked_min)];
    }),
    note: `ช่วงวันที่ ${fd(from)} – ${fd(to)}`,
  };
}

function groupLines(ls: any[], key: (l: any) => string, label: string): ReportResult {
  const g = new Map<string, any>();
  for (const l of ls) {
    const k = key(l);
    const r = g.get(k) || { n: 0, gross: 0, ded: 0, net: 0, tax: 0, ssoE: 0, ssoR: 0, pfE: 0, pfR: 0 };
    r.n++;
    r.gross += Number(l.gross);
    r.ded += Number(l.deductions);
    r.net += Number(l.net);
    r.tax += Number(l.tax);
    r.ssoE += Number(l.sso_employee);
    r.ssoR += Number(l.sso_employer);
    r.pfE += Number(l.pf_employee);
    r.pfR += Number(l.pf_employer);
    g.set(k, r);
  }
  const rows: Cell[][] = [...g.entries()].sort().map(([k, r]) => [k, r.n, n2(r.gross), n2(r.ded), n2(r.net), n2(r.tax), n2(r.ssoE), n2(r.ssoR), n2(r.pfE), n2(r.pfR)]);
  const t = [...g.values()].reduce((a, r) => Object.fromEntries(Object.keys(r).map((k) => [k, (a[k] || 0) + r[k]])), {} as any);
  if (g.size) rows.push(["รวม", t.n, n2(t.gross), n2(t.ded), n2(t.net), n2(t.tax), n2(t.ssoE), n2(t.ssoR), n2(t.pfE), n2(t.pfR)]);
  return { cols: [label, "จำนวนคน", "รายได้", "รายหัก", "สุทธิ", "ภาษี", "ปกส. ลูกจ้าง", "ปกส. นายจ้าง", "PF ลูกจ้าง", "PF นายจ้าง"], rows };
}

async function annualTax(c: Ctx) {
  const all = c.ids === null;
  return sql()`
    select e.id as employee_id, e.code, e.title, e.first_name, e.last_name, e.national_id, e.tax_method, e.address_registered, e.address_current,
           coalesce(sum(l.taxable),0) + coalesce(max(o.income),0) as income, coalesce(sum(l.tax),0) + coalesce(max(o.tax),0) as tax,
           coalesce(sum(l.sso_employee),0) + coalesce(max(o.sso),0) as sso, coalesce(sum(l.pf_employee),0) + coalesce(max(o.pf),0) as pf
    from employees e
    left join payroll_lines l on l.employee_id = e.id and exists (
      select 1 from payroll_periods p where p.id = l.period_id and p.status in ('approved','closed','paid') and extract(year from p.pay_date) = ${c.p.year})
    left join ytd_openings o on o.employee_id = e.id and o.year = ${c.p.year}
    where (${all}::boolean or e.id = any(${c.ids ?? []}::int[])) and (${c.p.company}::int is null or e.company_id = ${c.p.company})
    group by e.id having coalesce(sum(l.taxable),0) + coalesce(max(o.income),0) > 0
    order by e.code`;
}

/* ---------------- access & params ---------------- */

export function reportByCode(code: string) {
  return REPORTS.find((r) => r.code === code.toUpperCase()) || null;
}

/** Which employees u may see in report r: null = everyone, [] = nobody, or a team list. */
export async function reportScope(u: User, r: ReportDef): Promise<number[] | null | false> {
  if (r.payroll && !can(u, "payroll")) return false;
  if (can(u, "reports")) return null;
  if (r.code === "B014" && can(u, "employees") && can(u, "employees.export")) return null;
  if (r.team) {
    const s = await teamScope(u);
    if (s === "all") return null;
    return s.length ? s : false;
  }
  return false;
}

export function readParams(sp: any): ReportParams {
  const today = todayBkk();
  const month = /^\d{4}-\d{2}$/.test(sp.month || "") ? sp.month : monthBkk();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from || "") ? sp.from : `${today.slice(0, 7)}-01`;
  let to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to || "") ? sp.to : today;
  if (to < from) to = from;
  if (eachDay(from, to).length > 400) to = addDays(from, 399);
  return {
    from, to, month,
    year: Number(sp.year) || Number(today.slice(0, 4)),
    period: Number(sp.period) || null,
    company: Number(sp.company) || null,
  };
}

export async function runReport(u: User, code: string, sp: any): Promise<{ def: ReportDef; result: ReportResult } | { error: string }> {
  const def = reportByCode(code);
  if (!def) return { error: "ไม่พบรายงาน" };
  const scope = await reportScope(u, def);
  if (scope === false) return { error: "คุณไม่มีสิทธิ์ดูรายงานนี้" };
  const salary = can(u, "payroll") || can(u, "employees.salary");
  try {
    const result = await def.run({ p: readParams(sp), ids: scope, salary });
    return { def, result };
  } catch (e: any) {
    if (e instanceof ReportError) return { error: e.message };
    throw e;
  }
}
