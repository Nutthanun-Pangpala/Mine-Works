import { sql } from "./db";
import { conditionsOf } from "./settings";
import { addDays, d2, diffDays, eachDay, todayBkk, weekday, yearsOfService } from "./util";

export type Quota = {
  type_id: number;
  name: string;
  category: string;
  base_kind: string;
  unit: string;
  entitled: number | null; // null = unlimited
  carried: number;
  used: number;
  pending: number;
  remaining: number | null;
};

/** Leave year containing a date, given the company annual cutoff "MM-DD". */
export function leaveYear(date: string, cutoff = "01-01"): { year: number; from: string; to: string } {
  const y = Number(date.slice(0, 4));
  const start = `${y}-${cutoff}`;
  const year = date >= start ? y : y - 1;
  const from = `${year}-${cutoff}`;
  const to = addDays(`${year + 1}-${cutoff}`, -1);
  return { year, from, to };
}

export function entitlement(type: any, emp: any, year: { year: number; from: string; to: string }, override?: number | null): number | null {
  if (override !== null && override !== undefined) return Number(override);
  const q = type.quota || {};
  if (q.unit === "unlimited" || (!q.unit && type.category !== "leave")) return null;
  if (type.rules?.gender && type.rules.gender !== "all" && emp.gender && emp.gender !== type.rules.gender) return 0;
  let days = Number(q.days ?? 0);
  if (q.by === "level" && q.levels && emp.level_id && q.levels[emp.level_id] !== undefined) days = Number(q.levels[emp.level_id]);
  let eligibleFrom = emp.start_date || year.from;
  if (q.by === "tenure") {
    const tiers: [number, number][] = (q.tenure || []).map((t: any) => [Number(t[0]), Number(t[1])]).sort((a: any, b: any) => a[0] - b[0]);
    const yos = yearsOfService(emp.start_date, year.to);
    days = 0;
    for (const [yrs, d] of tiers) if (yos >= yrs) days = d;
    if (tiers.length && emp.start_date) {
      // first tier is earned on the anniversary
      const first = tiers[0][0];
      const s = String(emp.start_date);
      eligibleFrom = `${Number(s.slice(0, 4)) + Math.floor(first)}${s.slice(4)}`;
    }
  }
  if (q.prorate && eligibleFrom > year.from && eligibleFrom <= year.to) {
    const total = diffDays(year.from, year.to) + 1;
    const left = diffDays(eligibleFrom, year.to) + 1;
    days = Math.floor(((days * left) / total) * 2) / 2; // round down to half days
  }
  if (emp.start_date && emp.start_date > year.to) return 0;
  return days;
}

/** Quotas for one employee for the leave year containing `at`. */
export async function quotasFor(employeeId: number, at = todayBkk(), category = "leave"): Promise<Quota[]> {
  const emp = (
    await sql()`
      select e.id, e.gender, e.start_date::text as start_date, e.company_id, p.level_id, c.conditions
      from employees e left join positions p on p.id = e.position_id left join companies c on c.id = e.company_id
      where e.id = ${employeeId}`
  )[0];
  if (!emp) return [];
  const cond = conditionsOf({ conditions: emp.conditions });
  const yr = leaveYear(at, cond.annual_cutoff || "01-01");
  const prev = leaveYear(addDays(yr.from, -1), cond.annual_cutoff || "01-01");

  const [types, overrides, used] = await Promise.all([
    sql()`
      select * from leave_types where active and category = ${category}
        and (company_id is null or company_id = ${emp.company_id}) order by sort, id`,
    sql()`select leave_type_id, year, days from leave_quota_overrides where employee_id = ${employeeId} and year in (${yr.year}, ${prev.year})`,
    sql()`
      select sub_type_id, status, sum(days)::float as days,
             (start_date >= ${yr.from}::date) as this_year
      from requests
      where employee_id = ${employeeId} and doc_type = 'leave' and status in ('approved','pending')
        and start_date between ${prev.from} and ${yr.to}
      group by sub_type_id, status, (start_date >= ${yr.from}::date)`,
  ]);

  const ov = (t: number, y: number) => overrides.find((o: any) => o.leave_type_id === t && o.year === y)?.days ?? null;
  const usedOf = (t: number, thisYear: boolean, status?: string) =>
    used
      .filter((u: any) => u.sub_type_id === t && u.this_year === thisYear && (!status || u.status === status))
      .reduce((a: number, u: any) => a + Number(u.days), 0);

  return types.map((t: any) => {
    const ent = entitlement(t, emp, yr, ov(t.id, yr.year));
    let carried = 0;
    const carryMax = Number(t.rules?.carry_over || 0);
    if (carryMax > 0 && ent !== null) {
      const pe = entitlement(t, emp, prev, ov(t.id, prev.year));
      if (pe !== null) carried = Math.max(0, Math.min(carryMax, pe - usedOf(t.id, false)));
    }
    const u = usedOf(t.id, true, "approved");
    const p = usedOf(t.id, true, "pending");
    return {
      type_id: t.id, name: t.name, category: t.category, base_kind: t.base_kind, unit: t.quota?.unit || "day",
      entitled: ent, carried, used: u, pending: p,
      remaining: ent === null ? null : Math.round((ent + carried - u - p) * 100) / 100,
    };
  });
}

/**
 * Number of leave days a full-day request consumes between two dates
 * (only the employee's working days unless the type counts holidays).
 */
export async function countLeaveDays(employeeId: number, from: string, to: string, countHolidays: boolean): Promise<number> {
  if (countHolidays) return diffDays(from, to) + 1;
  const e = (
    await sql()`
      select e.shift_id, coalesce(e.calendar_id, (select id from holiday_calendars where is_default order by id limit 1)) as cal,
             s.weekdays
      from employees e left join shifts s on s.id = e.shift_id where e.id = ${employeeId}`
  )[0];
  const [hol, asg] = await Promise.all([
    sql()`select holiday_date::text as d from holidays where calendar_id = ${e?.cal ?? null} and active and holiday_date between ${from} and ${to}`,
    sql()`select work_date::text as d, shift_id from shift_assignments where employee_id = ${employeeId} and work_date between ${from} and ${to}`,
  ]);
  const holidays = new Set(hol.map((h: any) => h.d));
  const assigned = new Map<string, any>(asg.map((a: any) => [a.d, a.shift_id]));
  const weekdays: number[] = e?.weekdays || [1, 2, 3, 4, 5];
  let n = 0;
  for (const d of eachDay(from, to)) {
    if (holidays.has(d)) continue;
    if (assigned.has(d)) {
      if (assigned.get(d)) n++;
      continue;
    }
    if (weekdays.includes(weekday(d))) n++;
  }
  return n;
}

export function yearLabel(y: number, cutoff = "01-01"): string {
  return cutoff === "01-01" ? `${y + 543}` : `${d2(Number(cutoff.slice(3)))}/${cutoff.slice(0, 2)}/${y + 543}`;
}
