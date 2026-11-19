"use server";

import { sql } from "@/lib/db";
import { can, hashPassword, requireUser } from "@/lib/auth";
import { back } from "@/lib/nav";
import { parseCSV } from "@/lib/csv";
import { audit } from "@/lib/log";
import { isDate } from "@/lib/util";


async function readFile(fd: FormData): Promise<string[][] | null> {
  const f = fd.get("file") as any;
  if (!f || typeof f === "string" || !f.size) return null;
  return parseCSV(await f.text());
}

/** นำเข้าข้อมูลพนักงาน (CSV): insert new codes, update existing ones. */
export async function importEmployees(fd: FormData) {
  const ret = "/settings/import";
  const u = await requireUser();
  if (!can(u, "employees", "create")) back(ret, { error: "forbidden" });
  const rows = await readFile(fd);
  if (!rows || rows.length < 2) back(ret, { error: "required" });
  const head = rows![0].map((h) => h.trim().toLowerCase());
  const idx = (k: string) => head.indexOf(k);
  if (idx("code") < 0 || idx("first_name") < 0 || idx("last_name") < 0) back(ret, { error: "invalid" });
  const [cos, brs, uns, pos, shs, ets, etypes] = await Promise.all([
    sql()`select id, code from companies`, sql()`select id, company_id, code from branches`, sql()`select id, company_id, name from org_units`,
    sql()`select id, name from positions`, sql()`select id, code from shifts`, sql()`select id, code from employment_types`,
    sql()`select id, name from master_options where category = 'employee_type'`,
  ]);
  const defCompany = cos[0]?.id;
  let inserted = 0, updated = 0, failed = 0;
  const supervisors: [string, string][] = [];
  for (const r of rows!.slice(1)) {
    const g = (k: string) => {
      const i = idx(k);
      const v = i >= 0 ? (r[i] ?? "").trim() : "";
      return v === "" ? null : v;
    };
    const code = g("code");
    if (!code || !g("first_name") || !g("last_name")) {
      failed++;
      continue;
    }
    const companyId = cos.find((c: any) => c.code === g("company_code"))?.id ?? defCompany;
    const vals = {
      company_id: companyId,
      branch_id: brs.find((b: any) => b.company_id === companyId && b.code === g("branch_code"))?.id ?? null,
      org_unit_id: uns.find((x: any) => x.company_id === companyId && x.name === g("unit_name"))?.id ?? null,
      position_id: pos.find((x: any) => x.name === g("position_name"))?.id ?? null,
      shift_id: shs.find((x: any) => x.code === g("shift_code"))?.id ?? null,
      employment_type_id: ets.find((x: any) => x.code === (g("employment_type_code") || "").toUpperCase())?.id ?? ets[0]?.id ?? null,
      employee_type_id: etypes.find((x: any) => x.name === g("employee_type"))?.id ?? null,
      status: ["pending", "probation", "confirmed", "terminated"].includes(g("status") || "") ? g("status") : "probation",
      gender: ["male", "female", "other"].includes(g("gender") || "") ? g("gender") : g("gender") === "ชาย" ? "male" : g("gender") === "หญิง" ? "female" : null,
      birth_date: isDate(g("birth_date")) ? g("birth_date") : null,
      start_date: isDate(g("start_date")) ? g("start_date") : null,
      salary: Number(g("salary") || 0) || 0,
    };
    const pw = g("password");
    try {
      const ex = await sql()`select id from employees where code = ${code}`;
      if (ex[0]) {
        await sql()`
          update employees set title = coalesce(${g("title")}, title), first_name = ${g("first_name")}, last_name = ${g("last_name")},
            first_name_en = coalesce(${g("first_name_en")}, first_name_en), last_name_en = coalesce(${g("last_name_en")}, last_name_en),
            nickname = coalesce(${g("nickname")}, nickname), gender = coalesce(${vals.gender}, gender), birth_date = coalesce(${vals.birth_date}::date, birth_date),
            national_id = coalesce(${g("national_id")}, national_id), work_email = coalesce(${g("work_email")?.toLowerCase() ?? null}, work_email),
            mobile = coalesce(${g("mobile")}, mobile), start_date = coalesce(${vals.start_date}::date, start_date),
            company_id = ${vals.company_id}, branch_id = coalesce(${vals.branch_id}::int, branch_id), org_unit_id = coalesce(${vals.org_unit_id}::int, org_unit_id),
            position_id = coalesce(${vals.position_id}::int, position_id), shift_id = coalesce(${vals.shift_id}::int, shift_id),
            employment_type_id = coalesce(${vals.employment_type_id}::int, employment_type_id), employee_type_id = coalesce(${vals.employee_type_id}::int, employee_type_id),
            salary = case when ${vals.salary}::numeric > 0 then ${vals.salary} else salary end,
            bank_name = coalesce(${g("bank_name")}, bank_name), bank_account = coalesce(${g("bank_account")}, bank_account),
            password_hash = coalesce(${pw ? hashPassword(pw) : null}, password_hash), updated_at = now()
          where id = ${ex[0].id}`;
        updated++;
      } else {
        await sql()`
          insert into employees (code, title, first_name, last_name, first_name_en, last_name_en, nickname, gender, birth_date, national_id,
            work_email, mobile, start_date, status, company_id, branch_id, org_unit_id, position_id, shift_id, employment_type_id, employee_type_id,
            salary, bank_name, bank_account, sso_id, password_hash)
          values (${code}, ${g("title")}, ${g("first_name")}, ${g("last_name")}, ${g("first_name_en")}, ${g("last_name_en")}, ${g("nickname")},
            ${vals.gender}, ${vals.birth_date}, ${g("national_id")}, ${g("work_email")?.toLowerCase() ?? null}, ${g("mobile")}, ${vals.start_date},
            ${vals.status}, ${vals.company_id}, ${vals.branch_id}, ${vals.org_unit_id}, ${vals.position_id}, ${vals.shift_id}, ${vals.employment_type_id},
            ${vals.employee_type_id}, ${vals.salary}, ${g("bank_name")}, ${g("bank_account")}, ${g("national_id")}, ${pw ? hashPassword(pw) : null})`;
        inserted++;
      }
      if (g("supervisor_code")) supervisors.push([code, g("supervisor_code")!]);
    } catch {
      failed++;
    }
  }
  for (const [c, s] of supervisors)
    await sql()`update employees set supervisor_id = (select id from employees where code = ${s}) where code = ${c} and ${c} <> ${s}`;
  await audit(u.id, "import", "employees", null, { inserted, updated, failed });
  back(ret, { ok: `นำเข้าแล้ว: เพิ่ม ${inserted} · อัปเดต ${updated} · ไม่สำเร็จ ${failed}` });
}

/** นำเข้าเวลาทาบบัตร (CSV: code, datetime 'YYYY-MM-DD HH:MM'). */
export async function importClock(fd: FormData) {
  const ret = "/settings/import?tab=clock";
  const u = await requireUser();
  if (!can(u, "employees", "edit")) back(ret, { error: "forbidden" });
  const rows = await readFile(fd);
  if (!rows) back(ret, { error: "required" });
  const emps = await sql()`select id, code from employees`;
  let n = 0, bad = 0;
  for (const [i, r] of rows!.entries()) {
    const code = (r[0] || "").trim();
    // either "code, YYYY-MM-DD HH:MM" or "code, YYYY-MM-DD, HH:MM"
    const dt = ((r[2] || "").trim() ? `${(r[1] || "").trim()} ${(r[2] || "").trim()}` : (r[1] || "").trim()).replace("T", " ");
    const e = emps.find((x: any) => x.code === code);
    if (!e || !/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}/.test(dt)) {
      if (i > 0) bad++; // first row may be a header
      continue;
    }
    await sql()`insert into clock_records (employee_id, ts, source) values (${e.id}, ${dt.replace(/ (\d):/, " 0$1:").slice(0, 16).replace(" ", "T") + ":00+07:00"}, 'import')`;
    n++;
  }
  await audit(u.id, "import", "clock_records", null, { n, bad });
  back(ret, { ok: `นำเข้าเวลา ${n} รายการ · ข้าม ${bad} แถว` });
}

/** นำเข้าสิทธิ์การลา (กำหนดเอง) CSV: code, leave_type_code, year (ค.ศ.), days */
export async function importLeaveQuota(fd: FormData) {
  const ret = "/settings/import?tab=quota";
  const u = await requireUser();
  if (!can(u, "employees", "edit")) back(ret, { error: "forbidden" });
  const rows = await readFile(fd);
  if (!rows) back(ret, { error: "required" });
  const [emps, types] = await Promise.all([sql()`select id, code from employees`, sql()`select id, code from leave_types`]);
  let n = 0, bad = 0;
  for (const [i, r] of rows!.entries()) {
    const e = emps.find((x: any) => x.code === (r[0] || "").trim());
    const t = types.find((x: any) => x.code === (r[1] || "").trim());
    const y = Number(r[2]);
    const d = Number(r[3]);
    if (!e || !t || !y || !Number.isFinite(d)) {
      if (i > 0) bad++; // first row may be a header
      continue;
    }
    await sql()`
      insert into leave_quota_overrides (employee_id, leave_type_id, year, days) values (${e.id}, ${t.id}, ${y}, ${d})
      on conflict (employee_id, leave_type_id, year) do update set days = excluded.days`;
    n++;
  }
  back(ret, { ok: `นำเข้าสิทธิ์การลา ${n} รายการ · ข้าม ${bad} แถว` });
}
