"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { createSession, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { str } from "@/lib/form";
import { back } from "@/lib/nav";
import { audit } from "@/lib/log";

export async function login(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const rows = await sql()`
    select id, password_hash from employees
    where (lower(work_email) = ${email} or lower(code) = ${email}) and status <> 'terminated' and login_enabled`;
  if (!rows[0] || !verifyPassword(password, rows[0].password_hash)) redirect("/login?error=login");
  await createSession(rows[0].id);
  await audit(rows[0].id, "login", "employee", rows[0].id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function changePassword(fd: FormData) {
  const u = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  if (next.length < 8) back("/me", { error: "password" });
  const rows = await sql()`select password_hash from employees where id = ${u.id}`;
  if (!verifyPassword(current, rows[0].password_hash)) back("/me", { error: "wrongpassword" });
  await sql()`update employees set password_hash = ${hashPassword(next)} where id = ${u.id}`;
  back("/me");
}

/** First-run: create the company owner account when no employee exists yet. */
export async function setupFirstAdmin(fd: FormData) {
  const n = await sql()`select count(*)::int as n from employees where password_hash is not null and login_enabled`;
  if (n[0].n > 0) redirect("/login?error=setupdone");
  const email = str(fd, "email")?.toLowerCase();
  const pw = String(fd.get("password") ?? "");
  const first = str(fd, "first_name");
  const last = str(fd, "last_name");
  const companyName = str(fd, "company");
  if (!email || !first || !last) redirect("/setup?error=required");
  if (pw.length < 8) redirect("/setup?error=password");
  const c = await sql()`select id from companies order by id limit 1`;
  let companyId = c[0]?.id;
  if (!companyId) {
    const ins = await sql()`insert into companies (code, name_th) values ('C01', ${companyName || "บริษัทของฉัน"}) returning id`;
    companyId = ins[0].id;
  } else if (companyName) await sql()`update companies set name_th = ${companyName} where id = ${companyId}`;
  const pos = await sql()`select id from positions order by id limit 1`;
  const shift = await sql()`select id from shifts order by code limit 1`;
  const et = await sql()`select id from employment_types where code = 'MONTHLY'`;
  const cal = await sql()`select id from holiday_calendars order by is_default desc, id limit 1`;
  // employees may already exist (imported data without passwords): pick a free code
  const taken = await sql()`select 1 from employees where code = '00001'`;
  const code = taken.length ? (await sql()`select lpad((coalesce(max(code::int), 0) + 1)::text, 5, '0') as c from employees where code ~ '^[0-9]+$'`)[0].c : "00001";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const e = await sql()`
    insert into employees (code, company_id, position_id, shift_id, employment_type_id, calendar_id, status, start_date, first_name, last_name,
      work_email, password_hash, clock_required)
    values (${code}, ${companyId}, ${pos[0]?.id ?? null}, ${shift[0]?.id ?? null}, ${et[0]?.id ?? null}, ${cal[0]?.id ?? null}, 'confirmed', ${today},
      ${first}, ${last}, ${email}, ${hashPassword(pw)}, false)
    returning id`;
  await sql()`insert into user_roles (employee_id, role_id) select ${e[0].id}, id from roles where code = 'ADMIN'`;
  await createSession(e[0].id);
  redirect("/settings");
}
