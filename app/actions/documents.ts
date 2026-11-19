"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { can, requireUser, subordinateIds, User } from "@/lib/auth";
import { bool, date, int, num, str, time } from "@/lib/form";
import { back } from "@/lib/nav";
import { cancelRequest, createRequest, decide } from "@/lib/workflow";
import { countLeaveDays, quotasFor } from "@/lib/leave";
import { computeAttendance } from "@/lib/attendance";
import { saveUpload } from "@/lib/files";
import { conditionsOf, otRulesOf } from "@/lib/settings";
import { addDays, diffDays, timeToMin, todayBkk } from "@/lib/util";

/** Who may file a document for `employeeId`: self, HR with on-behalf right, or a supervisor in the line. */
async function mayFileFor(u: User, employeeId: number): Promise<boolean> {
  if (employeeId === u.id) return true;
  if (!can(u, "documents.onbehalf", "create")) return false;
  if (u.isHR) return true;
  return (await subordinateIds(u.id)).includes(employeeId);
}

function minutesBetween(st: string, et: string): number {
  let a = timeToMin(st)!;
  let b = timeToMin(et)!;
  if (b <= a) b += 1440;
  return b - a;
}

export async function createDocument(fd: FormData) {
  const u = await requireUser();
  const type = str(fd, "doc_type") || "";
  const employeeId = int(fd, "employee_id") || u.id;
  const ret = `/documents/new?type=${type}${employeeId !== u.id ? `&for=${employeeId}` : ""}`;
  if (!(await mayFileFor(u, employeeId))) back(ret, { error: "forbidden" });

  const emp = (
    await sql()`
      select e.*, e.start_date::text as sdate, e.probation_end_date::text as pend, c.conditions, c.ot_rules, et.pay_type
      from employees e left join companies c on c.id = e.company_id left join employment_types et on et.id = e.employment_type_id
      where e.id = ${employeeId}`
  )[0];
  if (!emp) back(ret, { error: "invalid" });
  const cond = conditionsOf({ conditions: emp.conditions });
  const dayMin = (cond.hours_per_day || 8) * 60;
  const today = todayBkk();
  const onProbation = emp.status === "probation" || emp.status === "pending";
  const behalf = employeeId !== u.id;

  const fileId = await saveUpload(fd, "file", u.id);
  if (fileId === "too_big") back(ret, { error: "filesize" });

  const detail = str(fd, "detail");
  const base: any = { employee_id: employeeId, doc_type: type, created_by: u.id, detail, file_id: fileId };

  if (type === "leave" || type === "offsite") {
    const typeId = int(fd, "sub_type_id");
    const lt = (await sql()`select * from leave_types where id = ${typeId} and active`)[0];
    if (!lt || lt.category !== type) back(ret, { error: "required" });
    const rules = lt.rules || {};
    const fullDay = str(fd, "mode") !== "hours";
    const sd = date(fd, "start_date");
    const ed = fullDay ? date(fd, "end_date") || sd : sd;
    if (!sd || !ed || ed < sd) back(ret, { error: "invalid" });
    if (type === "leave" && !detail) back(ret, { error: "required" });
    // rule checks (HR filing on behalf may bypass timing rules)
    if (!behalf) {
      if (sd < today && rules.allow_backdate === false) back(ret, { error: "backdate" });
      if (sd < today && rules.backdate_days && diffDays(sd, today) > Number(rules.backdate_days)) back(ret, { error: "backdate" });
      if (sd > today && rules.allow_advance === false) back(ret, { error: "advance" });
    }
    if (rules.after_probation && onProbation) back(ret, { error: "probation" });
    if (rules.gender && rules.gender !== "all" && emp.gender && emp.gender !== rules.gender) back(ret, { error: "gender" });
    let minutes = 0;
    let days = 0;
    let st: string | null = null;
    let et: string | null = null;
    if (fullDay) {
      days = await countLeaveDays(employeeId, sd!, ed!, !!rules.count_holidays);
      if (days <= 0 && type === "leave") back(ret, { error: "nodays" });
      minutes = days * dayMin;
      if (rules.max_consecutive_days && days > Number(rules.max_consecutive_days)) back(ret, { error: "consecutive" });
      if (rules.attach_after_days && days >= Number(rules.attach_after_days) && !fileId) back(ret, { error: "attach" });
    } else {
      st = time(fd, "start_time");
      et = time(fd, "end_time");
      if (!st || !et) back(ret, { error: "required" });
      minutes = minutesBetween(st!, et!);
      // exclude the shift break when the request spans it
      const s = (await sql()`select break_start::text, break_end::text from shifts where id = ${emp.shift_id}`)[0];
      if (s?.break_start && s?.break_end) {
        const a = timeToMin(st!)!, b = a + minutes, bs = timeToMin(s.break_start)!, be = timeToMin(s.break_end)!;
        minutes -= Math.max(0, Math.min(b, be) - Math.max(a, bs));
      }
      days = Math.round((minutes / dayMin) * 100) / 100;
      if (rules.min_half_day && minutes < dayMin / 2) back(ret, { error: "halfday" });
    }
    if (rules.min_minutes && minutes < Number(rules.min_minutes)) back(ret, { error: "minimum" });
    if (rules.attach && !fileId) back(ret, { error: "attach" });
    if (rules.once) {
      const used = await sql()`select 1 from requests where employee_id = ${employeeId} and sub_type_id = ${lt.id} and status in ('pending','approved') limit 1`;
      if (used[0]) back(ret, { error: "once" });
    }
    const overlap = await sql()`
      select 1 from requests where employee_id = ${employeeId} and doc_type in ('leave','offsite') and status in ('pending','approved')
        and start_date <= ${ed} and coalesce(end_date, start_date) >= ${sd}
        and (full_day or ${fullDay}::boolean or (start_time < ${et}::time and end_time > ${st}::time))
      limit 1`;
    if (overlap[0]) back(ret, { error: "overlap" });
    if (rules.max_docs_per_day) {
      const n = await sql()`select count(*)::int as n from requests where employee_id = ${employeeId} and sub_type_id = ${lt.id} and start_date = ${sd} and status in ('pending','approved')`;
      if (n[0].n >= Number(rules.max_docs_per_day)) back(ret, { error: "docs_per_day" });
    }
    if (type === "leave") {
      const q = (await quotasFor(employeeId, sd!)).find((x) => x.type_id === lt.id);
      if (q && q.remaining !== null && days > q.remaining + 1e-9) back(ret, { error: "quota" });
    }
    Object.assign(base, {
      sub_type_id: lt.id, start_date: sd, end_date: ed, start_time: st, end_time: et, full_day: fullDay, minutes, days,
      payload: { place: str(fd, "place") },
    });
  } else if (type === "certify") {
    const d = date(fd, "start_date");
    const inT = time(fd, "in_time");
    const outT = time(fd, "out_time");
    if (!d || (!inT && !outT) || !detail) back(ret, { error: "required" });
    const lt = (await sql()`select * from leave_types where category = 'certify' and active order by sort limit 1`)[0];
    const rules = lt?.rules || {};
    if (!behalf && rules.backdate_days && diffDays(d!, today) > Number(rules.backdate_days)) back(ret, { error: "backdate" });
    if (d! > today) back(ret, { error: "advance" });
    Object.assign(base, {
      sub_type_id: lt?.id ?? null, start_date: d, end_date: d, start_time: inT, end_time: outT,
      payload: { in_time: inT, out_time: outT, out_next_day: bool(fd, "out_next_day") },
    });
  } else if (type === "ot" || type === "accumulate" || type === "swap") {
    const d = date(fd, "start_date");
    const st = time(fd, "start_time");
    const et = time(fd, "end_time");
    if (!d || !st || !et) back(ret, { error: "required" });
    let minutes = minutesBetween(st!, et!);
    const ot = otRulesOf({ ot_rules: emp.ot_rules });
    if (type === "ot") {
      if (!detail || !int(fd, "reason_id")) back(ret, { error: "required" });
      if (!behalf && d! < today && (!ot.allow_backdate || diffDays(d!, today) > Number(ot.backdate_days || 0))) back(ret, { error: "backdate" });
      if (ot.after_probation && onProbation) back(ret, { error: "probation" });
      if (ot.break_minutes && ot.break_after_minutes && minutes > Number(ot.break_after_minutes)) minutes -= Number(ot.break_minutes);
      if (ot.rounding_minutes) minutes = Math.floor(minutes / Number(ot.rounding_minutes)) * Number(ot.rounding_minutes);
      if (minutes < Number(ot.min_minutes || 0)) back(ret, { error: "minimum" });
      if (ot.max_docs_per_day) {
        const n = await sql()`select count(*)::int as n from requests where employee_id = ${employeeId} and doc_type = 'ot' and start_date = ${d} and status in ('pending','approved')`;
        if (n[0].n >= Number(ot.max_docs_per_day)) back(ret, { error: "docs_per_day" });
      }
      // OT kind: OT2 on working days; on days off/holidays OT1 (monthly) or OT3 (daily) within normal hours, OT4 beyond
      let kind = str(fd, "ot_kind");
      if (!kind || kind === "auto") {
        const day = (await computeAttendance([employeeId], d!, d!)).get(employeeId)?.[0];
        if (!day || day.kind === "work") kind = "ot2";
        else {
          const sh = (await sql()`select start_time::text, end_time::text from shifts where id = ${emp.shift_id}`)[0];
          const within = sh && timeToMin(st!)! >= timeToMin(sh.start_time)! && timeToMin(et!)! <= timeToMin(sh.end_time)!;
          kind = within ? (emp.pay_type === "monthly" ? "ot1" : "ot3") : "ot4";
        }
      }
      Object.assign(base, { reason_id: int(fd, "reason_id"), payload: { ot_kind: kind } });
    } else {
      const lt = (await sql()`select * from leave_types where category = ${type} and active order by sort limit 1`)[0];
      const rules = lt?.rules || {};
      if (rules.min_minutes && minutes < Number(rules.min_minutes)) back(ret, { error: "minimum" });
      if (type === "swap") {
        // balance = approved accumulations not expired − approved/pending swaps
        const bal = await sql()`
          select coalesce(sum(case when doc_type = 'accumulate' and status = 'approved' then minutes else 0 end), 0)
               - coalesce(sum(case when doc_type = 'swap' and status in ('approved','pending') then minutes else 0 end), 0) as m
          from requests where employee_id = ${employeeId} and doc_type in ('accumulate','swap')
            and start_date >= ${addDays(today, -Number(rules.use_within_days || 365))}`;
        if (Number(bal[0].m) < minutes) back(ret, { error: "quota" });
      }
      Object.assign(base, { sub_type_id: lt?.id ?? null });
    }
    Object.assign(base, { start_date: d, end_date: d, start_time: st, end_time: et, full_day: false, minutes, days: 0 });
  } else if (type === "doc") {
    const kind = str(fd, "cert");
    if (!kind) back(ret, { error: "required" });
    Object.assign(base, { start_date: today, payload: { cert: kind, copies: int(fd, "copies") || 1, lang: str(fd, "lang") || "th" } });
  } else if (type === "change_shift") {
    const sd = date(fd, "start_date");
    const ed = date(fd, "end_date") || sd;
    if (!sd || !ed || ed < sd) back(ret, { error: "invalid" });
    if (!behalf && cond.shift_backdate === false && sd! < today) back(ret, { error: "backdate" });
    if (!behalf && cond.shift_backdate_days && sd! < today && diffDays(sd!, today) > Number(cond.shift_backdate_days)) back(ret, { error: "backdate" });
    Object.assign(base, { start_date: sd, end_date: ed, payload: { shift_id: int(fd, "shift_id") } });
  } else if (type === "swap_shift") {
    const d = date(fd, "start_date");
    const other = int(fd, "with_employee_id");
    if (!d || !other || other === employeeId) back(ret, { error: "required" });
    Object.assign(base, { start_date: d, end_date: d, payload: { with_employee_id: other } });
  } else if (type === "welfare" || type === "expense") {
    const d = date(fd, "start_date");
    const amount = num(fd, "amount");
    if (!d || !amount || amount <= 0 || !detail) back(ret, { error: "required" });
    if (type === "welfare") {
      const w = (await sql()`select * from welfare_types where id = ${int(fd, "sub_type_id")} and active`)[0];
      if (!w) back(ret, { error: "required" });
      if (w.after_probation && onProbation) back(ret, { error: "probation" });
      if (w.budget_per_year) {
        const used = await sql()`
          select coalesce(sum(amount), 0)::float as s from requests where employee_id = ${employeeId} and doc_type = 'welfare'
            and sub_type_id = ${w.id} and status in ('pending','approved') and extract(year from start_date) = ${Number(d!.slice(0, 4))}`;
        if (used[0].s + amount! > Number(w.budget_per_year)) back(ret, { error: "quota" });
      }
      base.sub_type_id = w.id;
    }
    Object.assign(base, { start_date: d, end_date: d, amount, payload: { category: str(fd, "category") } });
  } else if (type === "warning") {
    if (!behalf || !(can(u, "team", "create") || u.isHR)) back(ret, { error: "forbidden" });
    const d = date(fd, "start_date");
    if (!d || !detail) back(ret, { error: "required" });
    Object.assign(base, { start_date: d, end_date: d, reason_id: int(fd, "reason_id"), payload: { level: str(fd, "level") || "written1" } });
  } else {
    back(ret, { error: "invalid" });
  }

  const id = await createRequest(base);
  redirect(`/documents/${id}?ok=1`);
}

export async function cancelDocument(fd: FormData) {
  const u = await requireUser();
  const id = int(fd, "id");
  const r = (await sql()`select * from requests where id = ${id}`)[0];
  if (!r) back("/documents", { error: "invalid" });
  const own = r.employee_id === u.id || r.created_by === u.id;
  const hrCancel = can(u, "documents.onbehalf", "edit");
  if (!(own && r.status === "pending") && !hrCancel) back(`/documents/${id}`, { error: "forbidden" });
  await cancelRequest(id!, u.id);
  back(`/documents/${id}`);
}

export async function decideDocument(fd: FormData) {
  const u = await requireUser();
  const id = int(fd, "id");
  const approve = str(fd, "decision") === "approve";
  const comment = str(fd, "comment");
  const ret = str(fd, "back") || `/documents/${id}`;
  const ok = await decide(id!, u.id, u.roles.map((r) => r.id), approve, comment);
  if (!ok) back(ret, { error: "forbidden" });
  back(ret);
}

export async function decideMany(fd: FormData) {
  const u = await requireUser();
  const ids = fd.getAll("ids").map(Number).filter(Boolean);
  const approve = str(fd, "decision") === "approve";
  for (const id of ids) await decide(id, u.id, u.roles.map((r) => r.id), approve, null);
  back("/team/approvals");
}
