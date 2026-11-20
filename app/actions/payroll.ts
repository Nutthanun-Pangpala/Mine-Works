"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { can, canPayroll, requireUser, User } from "@/lib/auth";
import { date, int, num, str } from "@/lib/form";
import { back } from "@/lib/nav";
import { audit, notify } from "@/lib/log";
import { calculatePeriod, createPeriodsForMonth } from "@/lib/payroll";
import { isMonth } from "@/lib/util";
import { parseCSV } from "@/lib/csv";

async function guard(perm: string | null, ret: string): Promise<User> {
  const u = await requireUser();
  if (!can(u, "payroll")) back(ret, { error: "forbidden" });
  if (perm && !canPayroll(u, perm)) back(ret, { error: "forbidden" });
  return u;
}

async function period(id: number) {
  return (await sql()`select * from payroll_periods where id = ${id}`)[0];
}

export async function createPeriods(fd: FormData) {
  const ret = "/payroll";
  const u = await guard("calculate", ret);
  const cycle = int(fd, "cycle_id");
  const ym = str(fd, "month");
  if (!cycle || !isMonth(ym)) back(ret, { error: "required" });
  const n = await createPeriodsForMonth(cycle!, ym!);
  await audit(u.id, "create_periods", "payroll_cycle", cycle, { ym, n });
  back(ret, { ok: n ? `สร้างงวดใหม่ ${n} งวด` : "งวดของเดือนนี้มีอยู่แล้ว" });
}

export async function createSpecialPeriod(fd: FormData) {
  const ret = "/payroll";
  const u = await guard("calculate", ret);
  const company = int(fd, "company_id");
  const pay = date(fd, "pay_date");
  const name = str(fd, "name");
  if (!company || !pay || !name) back(ret, { error: "required" });
  const ins = await sql()`
    insert into payroll_periods (company_id, name, year, month, seq, start_date, end_date, att_start, att_end, pay_date, is_special)
    values (${company}, ${name}, ${Number(pay!.slice(0, 4))}, ${Number(pay!.slice(5, 7))}, 99, ${pay}, ${pay}, ${pay}, ${pay}, ${pay}, true)
    returning id`;
  await audit(u.id, "create_special", "payroll_period", ins[0].id);
  redirect(`/payroll/${ins[0].id}?ok=1`);
}

export async function calculate(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/payroll/${id}`;
  const u = await guard("calculate", ret);
  const p = await period(id);
  if (!p || !["draft", "calculated", "reviewed"].includes(p.status)) back(ret, { error: "locked" });
  const r = await calculatePeriod(id);
  await audit(u.id, "calculate", "payroll_period", id, r);
  back(ret, { ok: `คำนวณเงินเดือนแล้ว ${r.count} คน` });
}

const FLOW: Record<string, { from: string[]; to: string; perm: string; field?: string }> = {
  review: { from: ["calculated"], to: "reviewed", perm: "review", field: "reviewed_by" },
  approve: { from: ["calculated", "reviewed"], to: "approved", perm: "approve", field: "approved_by" },
  close: { from: ["approved"], to: "closed", perm: "close", field: "closed_by" },
  pay: { from: ["closed", "approved"], to: "paid", perm: "pay", field: "paid_by" },
  reopen: { from: ["reviewed", "approved"], to: "calculated", perm: "calculate" },
  reverse: { from: ["paid", "closed"], to: "approved", perm: "reverse" },
};

export async function transition(fd: FormData) {
  const id = int(fd, "id")!;
  const step = str(fd, "step") || "";
  const ret = `/payroll/${id}`;
  const f = FLOW[step];
  if (!f) back(ret, { error: "invalid" });
  const u = await guard(f.perm, ret);
  const p = await period(id);
  if (!p || !f.from.includes(p.status)) back(ret, { error: "state" });
  await sql().query(
    `update payroll_periods set status = $2 ${f.field ? `, ${f.field} = $3` : ""} ${step === "pay" ? ", paid_at = now()" : ""} where id = $1`,
    f.field ? [id, f.to, u.id] : [id, f.to],
  );
  await audit(u.id, step, "payroll_period", id);
  if (step === "pay") {
    const co = (await sql()`select slip_settings from companies where id = ${p.company_id}`)[0];
    if (co?.slip_settings?.auto_send) await sendSlipNotices(id);
  }
  back(ret);
}

async function sendSlipNotices(periodId: number) {
  const lines = await sql()`select l.id, l.employee_id, p.name from payroll_lines l join payroll_periods p on p.id = l.period_id where l.period_id = ${periodId}`;
  for (const l of lines) await notify([l.employee_id], `สลิปเงินเดือน ${l.name} พร้อมแล้ว`, null, `/print/payslip/${l.id}`);
}

export async function sendSlips(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/payroll/${id}`;
  await guard(null, ret);
  const p = await period(id);
  if (!["approved", "closed", "paid"].includes(p?.status)) back(ret, { error: "state" });
  await sendSlipNotices(id);
  back(ret, { ok: "ส่งสลิปเงินเดือนให้พนักงานแล้ว" });
}

export async function addManualItem(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/payroll/${id}`;
  const u = await guard("adjust", ret);
  const p = await period(id);
  if (!["draft", "calculated", "reviewed"].includes(p?.status)) back(ret, { error: "locked" });
  const emp = int(fd, "employee_id");
  const item = int(fd, "pay_item_id");
  const amt = num(fd, "amount");
  if (!emp || !item || !amt) back(ret, { error: "required" });
  await sql()`insert into payroll_manual_items (period_id, employee_id, pay_item_id, amount, note, created_by)
              values (${id}, ${emp}, ${item}, ${amt}, ${str(fd, "note")}, ${u.id})`;
  if (p.status !== "draft") await calculatePeriod(id);
  back(ret);
}

export async function deleteManualItem(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/payroll/${id}`;
  await guard("adjust", ret);
  const p = await period(id);
  if (!["draft", "calculated", "reviewed"].includes(p?.status)) back(ret, { error: "locked" });
  await sql()`delete from payroll_manual_items where id = ${int(fd, "mid")} and period_id = ${id}`;
  if (p.status !== "draft") await calculatePeriod(id);
  back(ret);
}

export async function updatePeriod(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/payroll/${id}`;
  await guard("adjust", ret);
  const p = await period(id);
  if (!["draft", "calculated", "reviewed"].includes(p?.status)) back(ret, { error: "locked" });
  await sql()`
    update payroll_periods set pay_date = coalesce(${date(fd, "pay_date")}::date, pay_date),
      att_start = coalesce(${date(fd, "att_start")}::date, att_start), att_end = coalesce(${date(fd, "att_end")}::date, att_end),
      name = coalesce(${str(fd, "name")}, name)
    where id = ${id}`;
  back(ret);
}

export async function deletePeriod(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/payroll/${id}`;
  const u = await requireUser();
  const p = await period(id);
  const ok = p && (p.status === "draft" || (p.is_special && canPayroll(u, "delete_special") && p.status !== "paid"));
  if (!ok || !can(u, "payroll")) back(ret, { error: "forbidden" });
  await sql()`delete from payroll_periods where id = ${id}`;
  await audit(u.id, "delete", "payroll_period", id);
  redirect("/payroll?ok=1");
}

/** นำเข้ารายการในงวด (CSV: employee_code,item_code,amount,note). */
export async function importManualItems(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/payroll/${id}`;
  const u = await guard("adjust", ret);
  const p = await period(id);
  if (!["draft", "calculated", "reviewed"].includes(p?.status)) back(ret, { error: "locked" });
  const f = fd.get("file") as any;
  if (!f || typeof f === "string" || !f.size) back(ret, { error: "required" });
  const rows = parseCSV(await f.text());
  const start = rows[0] && isNaN(Number(rows[0][2])) ? 1 : 0;
  const [emps, items] = await Promise.all([
    sql()`select id, code from employees where company_id = ${p.company_id}`,
    sql()`select id, code from pay_items where active`,
  ]);
  const ec = new Map(emps.map((e: any) => [String(e.code).trim(), e.id]));
  const ic = new Map(items.map((i: any) => [String(i.code).trim().toUpperCase(), i.id]));
  let ok = 0;
  const bad: number[] = [];
  for (let i = start; i < rows.length; i++) {
    const [code, item, amount, note] = rows[i].map((x) => (x || "").trim());
    const e = ec.get(code);
    const it = ic.get(item.toUpperCase());
    const amt = Number(amount.replace(/,/g, ""));
    if (!e || !it || !amt) {
      bad.push(i + 1);
      continue;
    }
    await sql()`insert into payroll_manual_items (period_id, employee_id, pay_item_id, amount, note, created_by)
                values (${id}, ${e}, ${it}, ${amt}, ${note || "นำเข้า"}, ${u.id})`;
    ok++;
  }
  if (ok && p.status !== "draft") await calculatePeriod(id);
  await audit(u.id, "import_items", "payroll_period", id, { ok, bad });
  back(ret, bad.length ? { error: `นำเข้าแล้ว ${ok} รายการ · ข้ามแถวที่ ${bad.slice(0, 20).join(", ")} (ไม่พบรหัสพนักงาน/รายการ หรือจำนวนเงินไม่ถูกต้อง)` } : { ok: `นำเข้าแล้ว ${ok} รายการ` });
}
