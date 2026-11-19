"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { can, hashPassword, requireUser, User } from "@/lib/auth";
import { bool, date, int, ints, num, str } from "@/lib/form";
import { back, isDup } from "@/lib/nav";
import { audit } from "@/lib/log";
import { getSettings } from "@/lib/settings";
import { saveUpload } from "@/lib/files";
import { nextCode } from "@/lib/lookups";
import { addDays, todayBkk } from "@/lib/util";

async function guard(perm: string, act: "view" | "create" | "edit" | "delete", ret: string): Promise<User> {
  const u = await requireUser();
  if (!can(u, perm, act)) back(ret, { error: "forbidden" });
  return u;
}

const pick = (fd: FormData) => ({
  title: str(fd, "title"),
  first_name: str(fd, "first_name"),
  last_name: str(fd, "last_name"),
  first_name_en: str(fd, "first_name_en"),
  last_name_en: str(fd, "last_name_en"),
  nickname: str(fd, "nickname"),
  nickname_en: str(fd, "nickname_en"),
  birth_date: date(fd, "birth_date"),
  gender: str(fd, "gender"),
  national_id: str(fd, "national_id"),
  passport_no: str(fd, "passport_no"),
  person_type: str(fd, "person_type") || "thai",
});

export async function createEmployee(fd: FormData) {
  const u = await guard("employees", "create", "/employees/new");
  const s = await getSettings();
  let code = str(fd, "code");
  if (!code) {
    const existing = (await sql()`select code from employees`).map((r: any) => r.code);
    const ec = s.org.emp_code || {};
    code = nextCode(existing, ec.mode === "custom" ? ec.prefix || "" : "", Number(ec.digits) || 5);
  }
  const p = pick(fd);
  if (!p.first_name || !p.last_name || !int(fd, "company_id")) back("/employees/new", { error: "required" });
  const start = date(fd, "start_date") || todayBkk();
  const company = (await sql()`select conditions from companies where id = ${int(fd, "company_id")}`)[0];
  const probationDays = Number(company?.conditions?.probation_days ?? 119);
  const status = start > todayBkk() ? "pending" : str(fd, "status") || "probation";
  const pw = str(fd, "password");
  try {
    const ins = await sql()`
      insert into employees (code, company_id, branch_id, org_unit_id, position_id, supervisor_id, shift_id, calendar_id,
        employment_type_id, employee_type_id, status, start_date, probation_end_date, contract_end_date, clock_required,
        person_type, title, first_name, last_name, first_name_en, last_name_en, nickname, nickname_en, birth_date, gender,
        national_id, passport_no, work_email, work_phone, mobile, personal_email,
        payment_method, bank_name, bank_account, salary, sso_enabled, sso_id, pf_enabled, pf_employee_rate, pf_employer_rate,
        password_hash)
      values (${code}, ${int(fd, "company_id")}, ${int(fd, "branch_id")}, ${int(fd, "org_unit_id")}, ${int(fd, "position_id")},
        ${int(fd, "supervisor_id")}, ${int(fd, "shift_id")}, ${int(fd, "calendar_id")}, ${int(fd, "employment_type_id")},
        ${int(fd, "employee_type_id")}, ${status}, ${start}, ${date(fd, "probation_end_date") || addDays(start, probationDays)},
        ${date(fd, "contract_end_date")}, ${!bool(fd, "no_clock")},
        ${p.person_type}, ${p.title}, ${p.first_name}, ${p.last_name}, ${p.first_name_en}, ${p.last_name_en}, ${p.nickname},
        ${p.nickname_en}, ${p.birth_date}, ${p.gender}, ${p.national_id}, ${p.passport_no},
        ${str(fd, "work_email")?.toLowerCase() ?? null}, ${str(fd, "work_phone")}, ${str(fd, "mobile")}, ${str(fd, "personal_email")},
        ${str(fd, "payment_method") || "bank"}, ${str(fd, "bank_name")}, ${str(fd, "bank_account")}, ${num(fd, "salary") || 0},
        ${!bool(fd, "no_sso")}, ${str(fd, "sso_id") || (p.national_id ?? null)}, ${bool(fd, "pf_enabled")},
        ${num(fd, "pf_employee_rate") || 0}, ${num(fd, "pf_employer_rate") || 0},
        ${pw ? hashPassword(pw) : null})
      returning id`;
    const id = ins[0].id;
    if (num(fd, "salary"))
      await sql()`insert into salary_history (employee_id, effective_date, action, amount_before, amount_after, created_by)
                  values (${id}, ${start}, 'เริ่มงาน', null, ${num(fd, "salary")}, ${u.id})`;
    const roles = ints(fd, "role_ids");
    for (const r of roles) await sql()`insert into user_roles (employee_id, role_id) values (${id}, ${r}) on conflict do nothing`;
    await audit(u.id, "create", "employee", id);
    redirect(`/employees/${id}?ok=1`);
  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    if (isDup(e)) back("/employees/new", { error: "duplicate" });
    throw e;
  }
}

export async function updatePersonal(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/employees/${id}/personal`;
  await guard("employees.personal", "edit", ret);
  const p = pick(fd);
  if (!p.first_name || !p.last_name) back(ret, { error: "required" });
  await sql()`
    update employees set person_type = ${p.person_type}, title = ${p.title}, first_name = ${p.first_name}, last_name = ${p.last_name},
      first_name_en = ${p.first_name_en}, last_name_en = ${p.last_name_en}, nickname = ${p.nickname}, nickname_en = ${p.nickname_en},
      birth_date = ${p.birth_date}, gender = ${p.gender}, national_id = ${p.national_id}, passport_no = ${p.passport_no},
      work_permit_no = ${str(fd, "work_permit_no")}, work_permit_expiry = ${date(fd, "work_permit_expiry")},
      race = ${str(fd, "race")}, nationality = ${str(fd, "nationality")}, religion = ${str(fd, "religion")},
      marital_status = ${str(fd, "marital_status")}, military_status = ${str(fd, "military_status")},
      blood_type = ${str(fd, "blood_type")}, weight = ${num(fd, "weight")}, height = ${num(fd, "height")}, note = ${str(fd, "note")},
      updated_at = now()
    where id = ${id}`;
  const photo = await saveUpload(fd, "photo", id);
  if (photo === "too_big") back(ret, { error: "filesize" });
  if (photo) await sql()`update employees set photo_file_id = ${photo} where id = ${id}`;
  await audit((await requireUser()).id, "update_personal", "employee", id);
  back(ret);
}

export async function updateContact(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/employees/${id}/personal?tab=contact`;
  const u = await guard("employees.personal", "edit", ret);
  try {
    await sql()`
      update employees set work_email = ${str(fd, "work_email")?.toLowerCase() ?? null}, work_phone = ${str(fd, "work_phone")},
        personal_email = ${str(fd, "personal_email")}, mobile = ${str(fd, "mobile")}, line_id = ${str(fd, "line_id")},
        address_registered = ${str(fd, "address_registered")}, address_current = ${str(fd, "address_current")}, updated_at = now()
      where id = ${id}`;
  } catch (e) {
    if (isDup(e)) back(ret, { error: "duplicate" });
    throw e;
  }
  await audit(u.id, "update_contact", "employee", id);
  back(ret);
}

/** Add a row to one of the employee sub-tables. */
export async function addSubRecord(fd: FormData) {
  const id = int(fd, "id")!;
  const kind = str(fd, "kind");
  const ret = str(fd, "back") || `/employees/${id}/personal`;
  const u = await guard("employees.personal", "edit", ret);
  if (kind === "experience") {
    if (!str(fd, "company") || !str(fd, "position")) back(ret, { error: "required" });
    await sql()`insert into employee_experiences (employee_id, company, position, last_salary, date_from, date_to, responsibilities)
      values (${id}, ${str(fd, "company")}, ${str(fd, "position")}, ${num(fd, "last_salary")}, ${date(fd, "date_from")}, ${date(fd, "date_to")}, ${str(fd, "responsibilities")})`;
  } else if (kind === "education") {
    if (!str(fd, "institution") || !str(fd, "level")) back(ret, { error: "required" });
    await sql()`insert into employee_educations (employee_id, institution, level, country, faculty, major, year_from, year_to, gpa)
      values (${id}, ${str(fd, "institution")}, ${str(fd, "level")}, ${str(fd, "country")}, ${str(fd, "faculty")}, ${str(fd, "major")},
        ${int(fd, "year_from")}, ${int(fd, "year_to")}, ${num(fd, "gpa")})`;
  } else if (kind === "family") {
    if (!str(fd, "name") || !str(fd, "relationship")) back(ret, { error: "required" });
    await sql()`insert into employee_families (employee_id, name, relationship, birth_date, occupation, phone)
      values (${id}, ${str(fd, "name")}, ${str(fd, "relationship")}, ${date(fd, "birth_date")}, ${str(fd, "occupation")}, ${str(fd, "phone")})`;
  } else if (kind === "emergency") {
    if (!str(fd, "name")) back(ret, { error: "required" });
    await sql()`insert into emergency_contacts (employee_id, name, relationship, phone)
      values (${id}, ${str(fd, "name")}, ${str(fd, "relationship")}, ${str(fd, "phone")})`;
  }
  await audit(u.id, `add_${kind}`, "employee", id);
  back(ret);
}

export async function deleteSubRecord(fd: FormData) {
  const id = int(fd, "id")!;
  const rid = int(fd, "rid")!;
  const kind = str(fd, "kind");
  const ret = str(fd, "back") || `/employees/${id}/personal`;
  await guard("employees.personal", "edit", ret);
  const table: Record<string, string> = {
    experience: "employee_experiences",
    education: "employee_educations",
    family: "employee_families",
    emergency: "emergency_contacts",
  };
  if (table[kind!]) await sql().query(`delete from ${table[kind!]} where id = $1 and employee_id = $2`, [rid, id]);
  back(ret);
}

export async function updateEmployment(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/employees/${id}/employment`;
  const u = await guard("employees", "edit", ret);
  if (int(fd, "supervisor_id") === id) back(ret, { error: "invalid" });
  try {
    await sql()`
      update employees set code = coalesce(${str(fd, "code")}, code), company_id = ${int(fd, "company_id")}, branch_id = ${int(fd, "branch_id")},
        org_unit_id = ${int(fd, "org_unit_id")}, position_id = ${int(fd, "position_id")}, supervisor_id = ${int(fd, "supervisor_id")},
        shift_id = ${int(fd, "shift_id")}, calendar_id = ${int(fd, "calendar_id")}, employment_type_id = ${int(fd, "employment_type_id")},
        employee_type_id = ${int(fd, "employee_type_id")}, status = coalesce(${str(fd, "status")}, status),
        start_date = ${date(fd, "start_date")}, probation_end_date = ${date(fd, "probation_end_date")},
        confirm_date = ${date(fd, "confirm_date")}, contract_end_date = ${date(fd, "contract_end_date")},
        clock_required = ${bool(fd, "clock_required")}, driver_license = ${str(fd, "driver_license")},
        work_location = ${str(fd, "work_location")}, diligence_enabled = ${bool(fd, "diligence_enabled")}, updated_at = now()
      where id = ${id}`;
  } catch (e) {
    if (isDup(e)) back(ret, { error: "duplicate" });
    throw e;
  }
  await sql()`delete from employee_locations where employee_id = ${id}`;
  for (const l of ints(fd, "location_ids")) await sql()`insert into employee_locations (employee_id, location_id) values (${id}, ${l})`;
  await audit(u.id, "update_employment", "employee", id);
  back(ret);
}

export async function updateSalary(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/employees/${id}/salary`;
  const u = await guard("employees.salary", "edit", ret);
  const cur = (await sql()`select salary from employees where id = ${id}`)[0];
  const salary = num(fd, "salary") ?? 0;
  await sql()`
    update employees set payment_method = ${str(fd, "payment_method") || "bank"}, bank_name = ${str(fd, "bank_name")},
      bank_account = ${str(fd, "bank_account")}, salary = ${salary}, tax_method = ${str(fd, "tax_method") || "withhold"},
      pf_enabled = ${bool(fd, "pf_enabled")}, pf_employee_rate = ${num(fd, "pf_employee_rate") || 0},
      pf_employer_rate = ${num(fd, "pf_employer_rate") || 0}, pf_join_date = ${date(fd, "pf_join_date")},
      ewf_enabled = ${bool(fd, "ewf_enabled")}, updated_at = now()
    where id = ${id}`;
  if (Number(cur?.salary) !== salary)
    await sql()`
      insert into salary_history (employee_id, effective_date, action, amount_before, amount_after, note, created_by)
      values (${id}, ${date(fd, "effective_date") || todayBkk()}, 'แก้ไขฐานเงินเดือน', ${cur?.salary ?? null}, ${salary}, ${str(fd, "note")}, ${u.id})`;
  await audit(u.id, "update_salary", "employee", id);
  back(ret);
}

export async function updateSSO(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/employees/${id}/salary?tab=sso`;
  const u = await guard("employees.salary", "edit", ret);
  await sql()`
    update employees set sso_enabled = ${bool(fd, "sso_enabled")}, wcf_enabled = ${bool(fd, "wcf_enabled")},
      sso_id = ${str(fd, "sso_id")}, sso_doc = ${str(fd, "sso_doc")}, sso_card_date = ${date(fd, "sso_card_date")},
      sso_hospital = ${str(fd, "sso_hospital")}, sso_end_reason = ${str(fd, "sso_end_reason")}, updated_at = now()
    where id = ${id}`;
  await audit(u.id, "update_sso", "employee", id);
  back(ret);
}

export async function saveTaxAllowances(fd: FormData) {
  const id = int(fd, "id")!;
  const year = int(fd, "year")!;
  const ret = `/employees/${id}/salary?tab=tax&year=${year}`;
  await guard("employees.salary", "edit", ret);
  const keys = ["children", "children_2018", "parents", "disabled", "life_insurance", "health_insurance", "parent_health", "pension_insurance", "rmf", "ssf", "thai_esg", "home_loan_interest", "donation", "donation_edu", "other"];
  const data: any = { spouse: bool(fd, "spouse") };
  for (const k of keys) data[k] = num(fd, k) || 0;
  await sql()`
    insert into tax_allowances (employee_id, year, data) values (${id}, ${year}, ${JSON.stringify(data)}::jsonb)
    on conflict (employee_id, year) do update set data = excluded.data`;
  await sql()`
    insert into ytd_openings (employee_id, year, income, tax, sso, pf)
    values (${id}, ${year}, ${num(fd, "open_income") || 0}, ${num(fd, "open_tax") || 0}, ${num(fd, "open_sso") || 0}, ${num(fd, "open_pf") || 0})
    on conflict (employee_id, year) do update set income = excluded.income, tax = excluded.tax, sso = excluded.sso, pf = excluded.pf`;
  back(ret);
}

export async function addRecurringItem(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/employees/${id}/salary?tab=items`;
  await guard("employees.salary", "edit", ret);
  if (!int(fd, "pay_item_id") || !num(fd, "amount")) back(ret, { error: "required" });
  await sql()`
    insert into employee_pay_items (employee_id, pay_item_id, amount, start_date, end_date, note)
    values (${id}, ${int(fd, "pay_item_id")}, ${num(fd, "amount")}, ${date(fd, "start_date")}, ${date(fd, "end_date")}, ${str(fd, "note")})`;
  back(ret);
}

export async function deleteRecurringItem(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/employees/${id}/salary?tab=items`;
  await guard("employees.salary", "edit", ret);
  await sql()`delete from employee_pay_items where id = ${int(fd, "rid")} and employee_id = ${id}`;
  back(ret);
}

export async function addLiability(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/employees/${id}/salary?tab=liabilities`;
  await guard("employees.salary", "edit", ret);
  if (!str(fd, "kind") || !num(fd, "installment") || !date(fd, "start_date")) back(ret, { error: "required" });
  await sql()`
    insert into liabilities (employee_id, kind, pay_item_id, reference, total, installment, start_date, note)
    values (${id}, ${str(fd, "kind")}, ${int(fd, "pay_item_id")}, ${str(fd, "reference")}, ${num(fd, "total")}, ${num(fd, "installment")},
      ${date(fd, "start_date")}, ${str(fd, "note")})`;
  back(ret);
}

export async function toggleLiability(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/employees/${id}/salary?tab=liabilities`;
  await guard("employees.salary", "edit", ret);
  await sql()`update liabilities set active = not active where id = ${int(fd, "rid")} and employee_id = ${id}`;
  back(ret);
}

export async function saveLeaveOverride(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/employees/${id}/time?tab=quota`;
  await guard("employees", "edit", ret);
  const typeId = int(fd, "leave_type_id");
  const year = int(fd, "year");
  const days = num(fd, "days");
  if (!typeId || !year) back(ret, { error: "required" });
  if (days === null) await sql()`delete from leave_quota_overrides where employee_id = ${id} and leave_type_id = ${typeId} and year = ${year}`;
  else
    await sql()`
      insert into leave_quota_overrides (employee_id, leave_type_id, year, days, note) values (${id}, ${typeId}, ${year}, ${days}, ${str(fd, "note")})
      on conflict (employee_id, leave_type_id, year) do update set days = excluded.days, note = excluded.note`;
  back(ret);
}

export async function addAttachment(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/employees/${id}/documents`;
  const u = await guard("employees", "edit", ret);
  const f = await saveUpload(fd, "file", u.id);
  if (f === "too_big") back(ret, { error: "filesize" });
  if (!f) back(ret, { error: "required" });
  const typeId = int(fd, "type_id");
  const name = str(fd, "name") || (typeId ? (await sql()`select name from master_options where id = ${typeId}`)[0]?.name : "เอกสาร");
  await sql()`
    insert into employee_attachments (employee_id, type_id, name, file_id, expires_on, uploaded_by)
    values (${id}, ${typeId}, ${name}, ${f}, ${date(fd, "expires_on")}, ${u.id})`;
  back(ret);
}

export async function deleteAttachment(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/employees/${id}/documents`;
  await guard("employees", "delete", ret);
  await sql()`delete from employee_attachments where id = ${int(fd, "rid")} and employee_id = ${id}`;
  back(ret);
}

export async function updateAccount(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/employees/${id}/account`;
  const u = await guard("settings.system", "edit", ret);
  const pw = str(fd, "password");
  if (pw && pw.length < 8) back(ret, { error: "password" });
  await sql()`update employees set login_enabled = ${bool(fd, "login_enabled")} where id = ${id}`;
  if (pw) await sql()`update employees set password_hash = ${hashPassword(pw)} where id = ${id}`;
  const roleIds = ints(fd, "role_ids");
  // only admins may grant the Administrator role
  const admin = (await sql()`select id from roles where code = 'ADMIN'`)[0]?.id;
  const isAdmin = u.roles.some((r) => r.code === "ADMIN");
  const current = (await sql()`select role_id from user_roles where employee_id = ${id}`).map((r: any) => r.role_id);
  let next = roleIds;
  if (!isAdmin) next = current.includes(admin) ? [...roleIds.filter((r) => r !== admin), admin] : roleIds.filter((r) => r !== admin);
  await sql()`delete from user_roles where employee_id = ${id}`;
  for (const r of next) await sql()`insert into user_roles (employee_id, role_id) values (${id}, ${r}) on conflict do nothing`;
  await audit(u.id, "update_account", "employee", id, { roles: next });
  back(ret);
}

export async function deleteEmployee(fd: FormData) {
  const id = int(fd, "id")!;
  const u = await guard("employees", "delete", `/employees/${id}`);
  if (id === u.id) back(`/employees/${id}`, { error: "forbidden" });
  try {
    await sql()`delete from employees where id = ${id}`;
  } catch {
    back(`/employees/${id}`, { error: "inuse" });
  }
  await audit(u.id, "delete", "employee", id);
  redirect("/employees?ok=1");
}
