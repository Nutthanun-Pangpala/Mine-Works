import { sql } from "./db";
import { conditionsOf } from "./settings";
import { addDays, bkkToMs, eachDay, timeToMin, todayBkk, weekday } from "./util";

export type LeavePart = { request_id: number; type_id: number; name: string; base_kind: string; paid: boolean; minutes: number; days: number; category: string };

export type DayRecord = {
  date: string;
  kind: "work" | "off" | "holiday" | "na";
  holiday: string | null;
  holiday_kind: string | null;
  shift: { id: number; code: string; name: string; start: string; end: string; color: string | null } | null;
  in_ms: number | null;
  out_ms: number | null;
  late_min: number;
  early_min: number;
  absent: boolean;
  missing_in: boolean;
  missing_out: boolean;
  leaves: LeavePart[];
  leave_days: number;
  offsite: boolean;
  worked_min: number;
  expected_min: number;
};

type Ctx = {
  shifts: Map<number, any>;
  assigns: Map<string, number | null>;
  holidays: Map<string, { name: string; kind: string }>;
};

function shiftWindow(date: string, s: any) {
  const st = timeToMin(s.start_time)!;
  let en = timeToMin(s.end_time)!;
  if (en <= st) en += 1440;
  const start = bkkToMs(date, String(s.start_time).slice(0, 5));
  const end = start + (en - st) * 60000;
  let breakMin = 0;
  let bStart: number | null = null;
  let bEnd: number | null = null;
  if (s.break_start && s.break_end) {
    let bs = timeToMin(s.break_start)!;
    let be = timeToMin(s.break_end)!;
    if (bs < st) bs += 1440;
    if (be <= bs) be += 1440;
    breakMin = be - bs;
    bStart = start + (bs - st) * 60000;
    bEnd = start + (be - st) * 60000;
  }
  return { start, end, lengthMin: en - st - breakMin, bStart, bEnd };
}

/** Shift id an employee works on a date (assignment override, else default shift if weekday matches). */
export async function shiftOn(employeeId: number, date: string): Promise<number | null> {
  const a = await sql()`select shift_id from shift_assignments where employee_id = ${employeeId} and work_date = ${date}`;
  if (a[0]) return a[0].shift_id;
  const e = await sql()`select s.id, s.weekdays from employees e join shifts s on s.id = e.shift_id where e.id = ${employeeId}`;
  if (!e[0]) return null;
  return (e[0].weekdays || []).includes(weekday(date)) ? e[0].id : null;
}

export async function computeAttendance(empIds: number[], from: string, to: string): Promise<Map<number, DayRecord[]>> {
  const out = new Map<number, DayRecord[]>();
  if (empIds.length === 0) return out;
  const today = todayBkk();

  const [emps, shifts, assigns, holidays, clocks, reqs, defCal] = await Promise.all([
    sql().query(
      `select e.id, e.shift_id, e.calendar_id, e.start_date::text as start_date, e.end_date::text as end_date,
              e.clock_required, c.conditions
       from employees e left join companies c on c.id = e.company_id where e.id = any($1::int[])`,
      [empIds],
    ),
    sql()`select * from shifts`,
    sql().query(
      `select employee_id, work_date::text as d, shift_id from shift_assignments
       where employee_id = any($1::int[]) and work_date between $2 and $3`,
      [empIds, from, to],
    ),
    sql().query(
      `select calendar_id, holiday_date::text as d, name, kind from holidays where active and holiday_date between $1 and $2`,
      [from, to],
    ),
    sql().query(
      `select employee_id, extract(epoch from ts) * 1000 as ms from clock_records
       where employee_id = any($1::int[]) and ts >= ($2::date - 1)::timestamp at time zone 'Asia/Bangkok'
         and ts < ($3::date + 2)::timestamp at time zone 'Asia/Bangkok'
       order by ts`,
      [empIds, from, to],
    ),
    sql().query(
      `select r.id, r.employee_id, r.doc_type, r.sub_type_id, r.start_date::text as sd, r.end_date::text as ed,
              r.start_time::text as st, r.end_time::text as et, r.full_day, r.minutes,
              lt.name, lt.base_kind, lt.category, lt.rules
       from requests r left join leave_types lt on lt.id = r.sub_type_id
       where r.employee_id = any($1::int[]) and r.status = 'approved' and r.doc_type in ('leave','offsite')
         and r.start_date <= $3 and coalesce(r.end_date, r.start_date) >= $2`,
      [empIds, from, to],
    ),
    sql()`select id from holiday_calendars where is_default order by id limit 1`,
  ]);

  const shiftMap = new Map<number, any>(shifts.map((s: any) => [s.id, s]));
  const assignMap = new Map<string, number | null>();
  for (const a of assigns) assignMap.set(`${a.employee_id}|${a.d}`, a.shift_id);
  const holMap = new Map<string, { name: string; kind: string }>();
  for (const h of holidays) holMap.set(`${h.calendar_id}|${h.d}`, { name: h.name, kind: h.kind });
  const clockMap = new Map<number, number[]>();
  for (const c of clocks) {
    const arr = clockMap.get(c.employee_id) || [];
    arr.push(Number(c.ms));
    clockMap.set(c.employee_id, arr);
  }
  const reqMap = new Map<number, any[]>();
  for (const r of reqs) {
    const arr = reqMap.get(r.employee_id) || [];
    arr.push(r);
    reqMap.set(r.employee_id, arr);
  }
  const defaultCal = defCal[0]?.id ?? null;

  for (const e of emps) {
    const cond = conditionsOf({ conditions: e.conditions });
    const dayMin = (cond.hours_per_day || 8) * 60;
    const punches = clockMap.get(e.id) || [];
    const myReqs = reqMap.get(e.id) || [];
    const cal = e.calendar_id ?? defaultCal;
    const days: DayRecord[] = [];

    for (const date of eachDay(from, to)) {
      const rec: DayRecord = {
        date, kind: "work", holiday: null, holiday_kind: null, shift: null, in_ms: null, out_ms: null,
        late_min: 0, early_min: 0, absent: false, missing_in: false, missing_out: false, leaves: [],
        leave_days: 0, offsite: false, worked_min: 0, expected_min: 0,
      };
      if ((e.start_date && date < e.start_date) || (e.end_date && date > e.end_date)) {
        rec.kind = "na";
        days.push(rec);
        continue;
      }
      const key = `${e.id}|${date}`;
      const sid = assignMap.has(key) ? assignMap.get(key)! : e.shift_id;
      const s = sid ? shiftMap.get(sid) : null;
      const worksToday = !!s && (assignMap.has(key) || (s.weekdays || []).includes(weekday(date)));
      const hol = cal ? holMap.get(`${cal}|${date}`) : undefined;
      if (hol) {
        rec.kind = "holiday";
        rec.holiday = hol.name;
        rec.holiday_kind = hol.kind;
      } else if (!worksToday) rec.kind = "off";
      if (s && (worksToday || hol)) {
        rec.shift = { id: s.id, code: s.code, name: s.name, start: String(s.start_time).slice(0, 5), end: String(s.end_time).slice(0, 5), color: s.color };
      }

      // punches belonging to this day
      let win: ReturnType<typeof shiftWindow> | null = null;
      let lo: number, hi: number;
      if (rec.shift && s) {
        win = shiftWindow(date, s);
        lo = win.start - 4 * 3600000;
        hi = win.end + 6 * 3600000;
      } else {
        lo = bkkToMs(date, "04:00");
        hi = lo + 24 * 3600000;
      }
      const mine = punches.filter((p) => p >= lo && p < hi);
      if (mine.length >= 2) {
        rec.in_ms = mine[0];
        rec.out_ms = mine[mine.length - 1];
      } else if (mine.length === 1) {
        const mid = win ? (win.start + win.end) / 2 : lo + 12 * 3600000;
        if (mine[0] < mid) rec.in_ms = mine[0];
        else rec.out_ms = mine[0];
      }

      // approved leave / offsite
      let leaveStartCovers = false;
      let leaveEndCovers = false;
      for (const r of myReqs) {
        const ed = r.ed || r.sd;
        if (date < r.sd || date > ed) continue;
        if (r.doc_type === "offsite") {
          rec.offsite = true;
          continue;
        }
        const rules = r.rules || {};
        let minutes = 0;
        let daysUsed = 0;
        if (r.full_day) {
          if (rec.kind === "work" || (rules.count_holidays && rec.kind !== "na")) {
            minutes = win ? win.lengthMin : dayMin;
            daysUsed = 1;
          }
        } else {
          minutes = Number(r.minutes) || 0;
          daysUsed = Math.round((minutes / dayMin) * 100) / 100;
          if (win && r.st && r.et) {
            const ls = bkkToMs(date, r.st.slice(0, 5));
            const le = bkkToMs(date, r.et.slice(0, 5));
            if (ls <= win.start + 60000) leaveStartCovers = true;
            if (le >= win.end - 60000) leaveEndCovers = true;
          }
        }
        if (daysUsed > 0 || minutes > 0)
          rec.leaves.push({
            request_id: r.id, type_id: r.sub_type_id, name: r.name, base_kind: r.base_kind, category: r.category,
            paid: rules.paid !== false, minutes, days: daysUsed,
          });
      }
      rec.leave_days = rec.leaves.reduce((a, l) => a + l.days, 0);

      if (rec.kind === "work" && win) {
        rec.expected_min = win.lengthMin;
        const fullLeave = rec.leave_days >= 1;
        if (!fullLeave && !rec.offsite) {
          const grace = (cond.late_grace_min || 0) + (s.flexible ? s.flex_minutes || 0 : 0);
          if (rec.in_ms !== null && !leaveStartCovers) {
            rec.late_min = Math.max(0, Math.floor((rec.in_ms - win.start) / 60000) - grace);
          }
          if (rec.out_ms !== null && !leaveEndCovers) {
            let expectedEnd = win.end;
            if (s.flexible && rec.in_ms !== null && rec.in_ms > win.start) {
              expectedEnd = Math.min(win.end + (s.flex_minutes || 0) * 60000, rec.in_ms + (win.end - win.start));
            }
            rec.early_min = Math.max(0, Math.floor((expectedEnd - rec.out_ms) / 60000));
          }
          const past = date < today;
          if (rec.in_ms === null && rec.out_ms === null) {
            if (past && e.clock_required) rec.absent = true;
          } else if (e.clock_required) {
            rec.missing_in = rec.in_ms === null;
            rec.missing_out = rec.out_ms === null && past;
          }
          if (cond.absent_after_min && rec.late_min >= cond.absent_after_min) rec.absent = true;
          if (!e.clock_required) {
            rec.late_min = 0;
            rec.early_min = 0;
          }
        }
      }
      if (rec.in_ms !== null && rec.out_ms !== null) {
        let w = (rec.out_ms - rec.in_ms) / 60000;
        if (win && win.bStart && win.bEnd) {
          const ov = Math.max(0, Math.min(rec.out_ms, win.bEnd) - Math.max(rec.in_ms, win.bStart)) / 60000;
          w -= ov;
        }
        rec.worked_min = Math.max(0, Math.round(w));
      }
      days.push(rec);
    }
    out.set(e.id, days);
  }
  return out;
}

export function dayLabel(r: DayRecord): { text: string; cls: string } {
  if (r.kind === "na") return { text: "-", cls: "" };
  if (r.leave_days >= 1) return { text: r.leaves.map((l) => l.name).join(", "), cls: "leave" };
  if (r.kind === "holiday") return { text: r.holiday || "วันหยุด", cls: "holiday" };
  if (r.kind === "off") return { text: "วันหยุด", cls: "off" };
  if (r.offsite) return { text: "นอกสถานที่", cls: "approved" };
  if (r.absent) return { text: "ขาดงาน", cls: "rejected" };
  const parts: string[] = [];
  if (r.late_min) parts.push(`สาย ${r.late_min} น.`);
  if (r.early_min) parts.push(`กลับก่อน ${r.early_min} น.`);
  if (r.missing_in) parts.push("ไม่ทาบเข้า");
  if (r.missing_out) parts.push("ไม่ทาบออก");
  if (r.leaves.length) parts.push(r.leaves.map((l) => l.name).join(", "));
  if (parts.length) return { text: parts.join(", "), cls: "pending" };
  if (r.in_ms !== null) return { text: "ปกติ", cls: "approved" };
  return { text: "-", cls: "" };
}

/** Summaries used by payroll, reports and the team screen. */
export function summarize(days: DayRecord[]) {
  const s = {
    work_days: 0, present_days: 0, absent_days: 0, late_count: 0, late_min: 0, early_count: 0, early_min: 0,
    missing: 0, leave_days: 0, unpaid_leave_days: 0, holiday_days: 0, traditional_holidays: 0, off_days: 0, worked_min: 0,
    shift_days: new Map<number, number>(),
  };
  for (const d of days) {
    if (d.kind === "na") continue;
    if (d.kind === "holiday") {
      s.holiday_days++;
      if (d.holiday_kind === "traditional") s.traditional_holidays++;
    }
    if (d.kind === "off") s.off_days++;
    if (d.kind === "work") {
      s.work_days++;
      if (d.absent) s.absent_days++;
      else if (d.in_ms !== null || d.out_ms !== null || d.offsite) {
        s.present_days++;
        if (d.shift) s.shift_days.set(d.shift.id, (s.shift_days.get(d.shift.id) || 0) + 1);
      }
      if (d.late_min) {
        s.late_count++;
        s.late_min += d.late_min;
      }
      if (d.early_min) {
        s.early_count++;
        s.early_min += d.early_min;
      }
      if (d.missing_in || d.missing_out) s.missing++;
    }
    for (const l of d.leaves) {
      if (l.category !== "leave") continue;
      s.leave_days += l.days;
      if (!l.paid) s.unpaid_leave_days += l.days;
    }
    s.worked_min += d.worked_min;
  }
  return s;
}

export function dateRange(from: string, to: string) {
  return { from, to: to < from ? from : to, prev: addDays(from, -1) };
}
