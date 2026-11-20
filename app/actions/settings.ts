"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { can, requireUser, User } from "@/lib/auth";
import { bool, date, int, ints, num, str, strs, time } from "@/lib/form";
import { back, isDup, isFk } from "@/lib/nav";
import { audit } from "@/lib/log";
import { getSettings, setSetting } from "@/lib/settings";
import { saveUpload } from "@/lib/files";
import { PERM_GROUPS } from "@/lib/perm";

async function guard(area: string, act: "view" | "create" | "edit" | "delete", ret: string): Promise<User> {
  const u = await requireUser();
  if (!can(u, area, act)) back(ret, { error: "forbidden" });
  return u;
}

async function run(ret: string, fn: () => Promise<any>) {
  try {
    await fn();
  } catch (e: any) {
    if (isDup(e)) back(ret, { error: "duplicate" });
    if (isFk(e)) back(ret, { error: "inuse" });
    throw e;
  }
  revalidatePath("/", "layout");
  back(ret);
}

/* ---------------- 1.1 Organisation-level settings ---------------- */

export async function saveOrgSettings(fd: FormData) {
  const ret = "/settings/org";
  const u = await guard("settings.org", "edit", ret);
  const s = await getSettings();
  await setSetting("org", {
    ...s.org,
    emp_code: { mode: str(fd, "emp_code_mode") || "standard", prefix: str(fd, "emp_code_prefix") || "", digits: int(fd, "emp_code_digits") || 5 },
    invitation_code: str(fd, "invitation_code") || "",
    passcode: str(fd, "passcode") || "dob",
    show_mobile: bool(fd, "show_mobile"),
    show_birthday: bool(fd, "show_birthday"),
    newsfeed: str(fd, "newsfeed") || "all",
    clock_verify: str(fd, "clock_verify") || "none",
    daily_report: bool(fd, "daily_report"),
    expense_backdate_days: int(fd, "expense_backdate_days") ?? 60,
    expense_cutoff_day: int(fd, "expense_cutoff_day") ?? 25,
    pnd_basis: str(fd, "pnd_basis") || "period_end",
    theme: str(fd, "theme") || "#0f5f5c",
  });
  await audit(u.id, "update", "settings", null, { key: "org" });
  back(ret);
}

/* ---------------- 1.2 Companies ---------------- */

export async function saveCompany(fd: FormData) {
  const id = int(fd, "id");
  const ret = id ? `/settings/companies/${id}` : "/settings/companies";
  const u = await guard("settings.org", id ? "edit" : "create", ret);
  if (!str(fd, "name_th") || !str(fd, "code")) back(ret, { error: "required" });
  const logo = await saveUpload(fd, "logo", u.id);
  if (logo === "too_big") back(ret, { error: "filesize" });
  let newId = id;
  await run(ret, async () => {
    if (id) {
      await sql()`
        update companies set code = ${str(fd, "code")}, name_th = ${str(fd, "name_th")}, name_en = ${str(fd, "name_en")}, tax_id = ${str(fd, "tax_id")},
          phone = ${str(fd, "phone")}, country = ${str(fd, "country") || "ไทย"}, address_th = ${str(fd, "address_th")}, address_en = ${str(fd, "address_en")},
          province = ${str(fd, "province")}, district = ${str(fd, "district")}, subdistrict = ${str(fd, "subdistrict")}, postcode = ${str(fd, "postcode")},
          sso_employer_no = ${str(fd, "sso_employer_no")}, payroll_bank_mode = ${str(fd, "payroll_bank_mode") || "single_single"},
          bank_name = ${str(fd, "bank_name")}, bank_account = ${str(fd, "bank_account")}, active = ${bool(fd, "active")},
          logo_file_id = coalesce(${logo || null}::int, logo_file_id)
        where id = ${id}`;
    } else {
      const ins = await sql()`
        insert into companies (code, name_th, name_en, tax_id, conditions, ot_rules)
        select ${str(fd, "code")}, ${str(fd, "name_th")}, ${str(fd, "name_en")}, ${str(fd, "tax_id")}, conditions, ot_rules
        from (select conditions, ot_rules from companies order by id limit 1) c
        union all select ${str(fd, "code")}, ${str(fd, "name_th")}, ${str(fd, "name_en")}, ${str(fd, "tax_id")}, '{}'::jsonb, '{}'::jsonb
        where not exists (select 1 from companies)
        returning id`;
      newId = ins[0].id;
      await sql()`insert into branches (company_id, code, name, sso_branch_no) values (${newId}, '00000', 'สำนักงานใหญ่', '000000')`;
    }
  }).catch((e) => {
    if (!id && newId && e?.digest?.startsWith?.("NEXT_REDIRECT")) redirect(`/settings/companies/${newId}?ok=1`);
    throw e;
  });
}

const condKeys = {
  num: ["hours_per_day", "late_grace_min", "absent_after_min", "shift_backdate_days", "probation_days", "prorate_before_day", "retire_male", "retire_female", "count_month_if_last_day_after", "diligence_amount", "diligence_step", "diligence_max"],
  bool: ["hours_from_shift", "late_deduct", "absent_deduct", "shift_backdate", "supervisor_change_shift", "half_month_from_15", "self_resign", "auto_approve_separation"],
};

export async function saveCompanyConditions(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/settings/companies/${id}?tab=conditions`;
  await guard("settings.org", "edit", ret);
  const c: any = { annual_cutoff: str(fd, "annual_cutoff") || "01-01", score: {} };
  for (const k of condKeys.num) c[k] = num(fd, k) ?? 0;
  for (const k of condKeys.bool) c[k] = bool(fd, k);
  for (const k of ["every", "absent", "no_clock", "certify", "late", "sick", "sick_file", "personal", "ordination", "maternity"]) c.score[k] = num(fd, "score_" + k) ?? 0;
  await run(ret, () => sql()`update companies set conditions = ${JSON.stringify(c)}::jsonb where id = ${id}`);
}

export async function saveCompanyOT(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/settings/companies/${id}?tab=ot`;
  await guard("settings.org", "edit", ret);
  const r: any = { break_mode: str(fd, "break_mode") || "once", break_types: strs(fd, "break_types") };
  for (const k of ["min_minutes", "max_docs_per_day", "backdate_days", "break_minutes", "break_after_minutes", "rounding_minutes", "weekly_cap_hours"]) r[k] = num(fd, k) ?? 0;
  for (const k of ["allow_backdate", "after_probation", "holiday_rate_by_shift", "abnormal_day_ot", "flex_full_ot"]) r[k] = bool(fd, k);
  await run(ret, () => sql()`update companies set ot_rules = ${JSON.stringify(r)}::jsonb where id = ${id}`);
}

export async function saveCompanyDocs(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/settings/companies/${id}?tab=docs`;
  await guard("settings.org", "edit", ret);
  const signers: any = {};
  for (const k of ["salary_cert", "work_cert", "visa_cert", "tawi50", "payslip", "warning"]) signers[k] = int(fd, "signer_" + k);
  const d = { letterhead: bool(fd, "letterhead"), paper: str(fd, "paper") || "A4", signers, pickup: bool(fd, "pickup") };
  const s = { employee_choose: bool(fd, "employee_choose"), auto_send: bool(fd, "auto_send"), show_unit: str(fd, "show_unit") || "auto", note: str(fd, "slip_note") };
  await run(ret, () => sql()`update companies set doc_settings = ${JSON.stringify(d)}::jsonb, slip_settings = ${JSON.stringify(s)}::jsonb where id = ${id}`);
}

export async function saveBranch(fd: FormData) {
  const cid = int(fd, "company_id")!;
  const id = int(fd, "id");
  const ret = `/settings/companies/${cid}?tab=branches`;
  await guard("settings.org", "edit", ret);
  if (!str(fd, "code") || !str(fd, "name")) back(ret, { error: "required" });
  await run(ret, () =>
    id
      ? sql()`update branches set code = ${str(fd, "code")}, name = ${str(fd, "name")}, province = ${str(fd, "province")},
               sso_submit = ${bool(fd, "sso_submit")}, sso_branch_no = ${str(fd, "sso_branch_no")}, active = ${bool(fd, "active")} where id = ${id}`
      : sql()`insert into branches (company_id, code, name, province, sso_submit, sso_branch_no)
               values (${cid}, ${str(fd, "code")}, ${str(fd, "name")}, ${str(fd, "province")}, ${bool(fd, "sso_submit")}, ${str(fd, "sso_branch_no")})`,
  );
}

/* ---------------- 1.3 Org units ---------------- */

export async function saveUnit(fd: FormData) {
  const id = int(fd, "id");
  const ret = `/settings/units?company=${int(fd, "company_id") ?? ""}`;
  await guard("settings.org", id ? "edit" : "create", ret);
  if (!str(fd, "name") || !int(fd, "company_id")) back(ret, { error: "required" });
  if (id && int(fd, "parent_id") === id) back(ret, { error: "invalid" });
  await run(ret, () =>
    id
      ? sql()`update org_units set parent_id = ${int(fd, "parent_id")}, kind = ${str(fd, "kind") || "department"}, code = ${str(fd, "code")},
               name = ${str(fd, "name")}, name_en = ${str(fd, "name_en")}, cost_center = ${str(fd, "cost_center")},
               head_employee_id = ${int(fd, "head_employee_id")}, sort = ${int(fd, "sort") ?? 0}, active = ${bool(fd, "active")} where id = ${id}`
      : sql()`insert into org_units (company_id, parent_id, kind, code, name, name_en, cost_center, head_employee_id, sort)
               values (${int(fd, "company_id")}, ${int(fd, "parent_id")}, ${str(fd, "kind") || "department"}, ${str(fd, "code")}, ${str(fd, "name")},
                 ${str(fd, "name_en")}, ${str(fd, "cost_center")}, ${int(fd, "head_employee_id")}, ${int(fd, "sort") ?? 0})`,
  );
}

export async function deleteUnit(fd: FormData) {
  const ret = `/settings/units?company=${int(fd, "company_id") ?? ""}`;
  await guard("settings.org", "delete", ret);
  await run(ret, () => sql()`delete from org_units where id = ${int(fd, "id")}`);
}

/* ---------------- 1.4 Positions & levels ---------------- */

export async function savePosition(fd: FormData) {
  const id = int(fd, "id");
  const ret = "/settings/positions";
  await guard("settings.org", id ? "edit" : "create", ret);
  if (!str(fd, "name")) back(ret, { error: "required" });
  await run(ret, () =>
    id
      ? sql()`update positions set name = ${str(fd, "name")}, name_en = ${str(fd, "name_en")}, level_id = ${int(fd, "level_id")},
               company_id = ${int(fd, "company_id")}, headcount_plan = ${int(fd, "headcount_plan")}, description = ${str(fd, "description")},
               active = ${bool(fd, "active")} where id = ${id}`
      : sql()`insert into positions (name, name_en, level_id, company_id, headcount_plan, description)
               values (${str(fd, "name")}, ${str(fd, "name_en")}, ${int(fd, "level_id")}, ${int(fd, "company_id")}, ${int(fd, "headcount_plan")}, ${str(fd, "description")})`,
  );
}

export async function deletePosition(fd: FormData) {
  await guard("settings.org", "delete", "/settings/positions");
  await run("/settings/positions", () => sql()`delete from positions where id = ${int(fd, "id")}`);
}

export async function saveLevel(fd: FormData) {
  const id = int(fd, "id");
  const ret = "/settings/positions?tab=levels";
  await guard("settings.org", id ? "edit" : "create", ret);
  if (!str(fd, "code") || !str(fd, "name")) back(ret, { error: "required" });
  await run(ret, () =>
    id
      ? sql()`update position_levels set code = ${str(fd, "code")}, name = ${str(fd, "name")}, name_en = ${str(fd, "name_en")},
               description = ${str(fd, "description")}, rank = ${int(fd, "rank") ?? 100} where id = ${id}`
      : sql()`insert into position_levels (code, name, name_en, description, rank)
               values (${str(fd, "code")}, ${str(fd, "name")}, ${str(fd, "name_en")}, ${str(fd, "description")}, ${int(fd, "rank") ?? 100})`,
  );
}

export async function deleteLevel(fd: FormData) {
  await guard("settings.org", "delete", "/settings/positions?tab=levels");
  await run("/settings/positions?tab=levels", () => sql()`delete from position_levels where id = ${int(fd, "id")}`);
}

/* ---------------- 1.6 Master options ---------------- */

export async function saveOption(fd: FormData) {
  const id = int(fd, "id");
  const cat = str(fd, "category")!;
  const ret = `/settings/master?cat=${cat}`;
  const u = await guard("settings.org", id ? "edit" : "create", ret);
  if (!str(fd, "name")) back(ret, { error: "required" });
  await run(ret, () =>
    id
      ? sql()`update master_options set name = ${str(fd, "name")}, name_en = ${str(fd, "name_en")}, description = ${str(fd, "description")},
               sort = ${int(fd, "sort") ?? 0}, active = ${bool(fd, "active")}, updated_by = ${u.id}, updated_at = now() where id = ${id}`
      : sql()`insert into master_options (category, name, name_en, description, sort, updated_by)
               values (${cat}, ${str(fd, "name")}, ${str(fd, "name_en")}, ${str(fd, "description")},
                 coalesce(${int(fd, "sort")}::int, (select coalesce(max(sort),0) + 1 from master_options where category = ${cat})), ${u.id})`,
  );
}

export async function deleteOption(fd: FormData) {
  const ret = `/settings/master?cat=${str(fd, "category")}`;
  await guard("settings.org", "delete", ret);
  await run(ret, () => sql()`delete from master_options where id = ${int(fd, "id")}`);
}

/* ---------------- 1.7 Workflows ---------------- */

export async function saveWorkflow(fd: FormData) {
  const doc = str(fd, "doc_type")!;
  const sub = int(fd, "sub_type_id");
  const ret = `/settings/workflows?doc=${doc}${sub ? `&sub=${sub}` : ""}`;
  const u = await guard("settings.org", "edit", ret);
  if (bool(fd, "use_main") && sub) {
    await run(ret, () => sql()`delete from workflows where doc_type = ${doc} and sub_type_id = ${sub} and company_id is null`);
    return;
  }
  const modes = fd.getAll("mode").map(String);
  const steps: any[] = [];
  modes.forEach((m, i) => {
    if (!m) return;
    const s: any = { mode: m };
    if (m === "chain_n") s.n = Number(fd.getAll("n")[i]) || 1;
    if (m === "chain_to_level") s.level_code = String(fd.getAll("level_code")[i] || "");
    if (m === "person") s.employee_id = Number(fd.getAll("employee_id")[i]) || null;
    if (m === "role") s.role_id = Number(fd.getAll("role_id")[i]) || null;
    steps.push(s);
  });
  if (!steps.length) steps.push({ mode: "none" });
  await run(ret, async () => {
    await sql()`delete from workflows where doc_type = ${doc} and sub_type_id is not distinct from ${sub} and company_id is null`;
    await sql()`insert into workflows (doc_type, sub_type_id, steps, updated_by) values (${doc}, ${sub}, ${JSON.stringify(steps)}::jsonb, ${u.id})`;
  });
}

/* ---------------- 1.8 Announcements ---------------- */

export async function saveAnnouncement(fd: FormData) {
  const id = int(fd, "id");
  const ret = "/settings/announcements";
  const u = await guard("announcements", id ? "edit" : "create", ret);
  if (!str(fd, "title")) back(ret, { error: "required" });
  await run(ret, () =>
    id
      ? sql()`update announcements set kind = ${str(fd, "kind") || "news"}, title = ${str(fd, "title")}, body = ${str(fd, "body")},
               company_id = ${int(fd, "company_id")}, publish_at = ${date(fd, "publish_at")}, pinned = ${bool(fd, "pinned")}, active = ${bool(fd, "active")}
             where id = ${id}`
      : sql()`insert into announcements (kind, title, body, company_id, publish_at, pinned, created_by)
               values (${str(fd, "kind") || "news"}, ${str(fd, "title")}, ${str(fd, "body")}, ${int(fd, "company_id")},
                 coalesce(${date(fd, "publish_at")}::date, current_date), ${bool(fd, "pinned")}, ${u.id})`,
  );
}

export async function deleteAnnouncement(fd: FormData) {
  await guard("announcements", "delete", "/settings/announcements");
  await run("/settings/announcements", () => sql()`delete from announcements where id = ${int(fd, "id")}`);
}

/* ---------------- 2.1 Shifts ---------------- */

export async function saveShift(fd: FormData) {
  const id = int(fd, "id");
  const ret = id ? `/settings/shifts/${id}` : "/settings/shifts/new";
  const u = await guard("settings.time", id ? "edit" : "create", ret);
  const st = time(fd, "start_time");
  const et = time(fd, "end_time");
  if (!str(fd, "code") || !str(fd, "name") || !st || !et) back(ret, { error: "required" });
  const days = ints(fd, "weekdays");
  const vals = {
    code: str(fd, "code"), name: str(fd, "name"), company_id: int(fd, "company_id"), timezone: str(fd, "timezone") || "Asia/Bangkok",
    description: str(fd, "description"), shift_type: str(fd, "shift_type") || "morning", color: str(fd, "color"),
    allow_ot: bool(fd, "allow_ot"), holiday_ot_basis: str(fd, "holiday_ot_basis") || "previous_shift",
    break_start: time(fd, "break_start"), break_end: time(fd, "break_end"), ot_start: time(fd, "ot_start"), ot_end: time(fd, "ot_end"),
    flexible: bool(fd, "flexible"), flex_minutes: int(fd, "flex_minutes") ?? 0, pre_ot_minutes: int(fd, "pre_ot_minutes") ?? 0,
    auto_ot: bool(fd, "auto_ot"), auto_ot_min_minutes: int(fd, "auto_ot_min_minutes") ?? 60, allowance: num(fd, "allowance") ?? 0,
    break_status: bool(fd, "break_status"), active: bool(fd, "active"),
  };
  let newId = id;
  try {
    if (id) {
      await sql()`
        update shifts set code = ${vals.code}, name = ${vals.name}, company_id = ${vals.company_id}, timezone = ${vals.timezone},
          description = ${vals.description}, shift_type = ${vals.shift_type}, color = ${vals.color}, allow_ot = ${vals.allow_ot},
          holiday_ot_basis = ${vals.holiday_ot_basis}, start_time = ${st}, end_time = ${et}, break_start = ${vals.break_start},
          break_end = ${vals.break_end}, ot_start = ${vals.ot_start}, ot_end = ${vals.ot_end}, weekdays = ${days}::int[],
          flexible = ${vals.flexible}, flex_minutes = ${vals.flex_minutes}, pre_ot_minutes = ${vals.pre_ot_minutes}, auto_ot = ${vals.auto_ot},
          auto_ot_min_minutes = ${vals.auto_ot_min_minutes}, allowance = ${vals.allowance}, break_status = ${vals.break_status},
          active = ${vals.active}, updated_by = ${u.id}, updated_at = now()
        where id = ${id}`;
    } else {
      const ins = await sql()`
        insert into shifts (code, name, company_id, timezone, description, shift_type, color, allow_ot, holiday_ot_basis, start_time, end_time,
          break_start, break_end, ot_start, ot_end, weekdays, flexible, flex_minutes, pre_ot_minutes, auto_ot, auto_ot_min_minutes, allowance,
          break_status, active, updated_by)
        values (${vals.code}, ${vals.name}, ${vals.company_id}, ${vals.timezone}, ${vals.description}, ${vals.shift_type}, ${vals.color},
          ${vals.allow_ot}, ${vals.holiday_ot_basis}, ${st}, ${et}, ${vals.break_start}, ${vals.break_end}, ${vals.ot_start}, ${vals.ot_end},
          ${days}::int[], ${vals.flexible}, ${vals.flex_minutes}, ${vals.pre_ot_minutes}, ${vals.auto_ot}, ${vals.auto_ot_min_minutes},
          ${vals.allowance}, ${vals.break_status}, true, ${u.id})
        returning id`;
      newId = ins[0].id;
    }
  } catch (e) {
    if (isDup(e)) back(ret, { error: "duplicate" });
    throw e;
  }
  revalidatePath("/", "layout");
  redirect(`/settings/shifts/${newId}?ok=1`);
}

export async function deleteShift(fd: FormData) {
  await guard("settings.time", "delete", "/settings/shifts");
  await run("/settings/shifts", () => sql()`delete from shifts where id = ${int(fd, "id")}`);
}

/* ---------------- 2.2 Work-in locations ---------------- */

export async function saveLocation(fd: FormData) {
  const id = int(fd, "id");
  const ret = "/settings/locations";
  await guard("settings.time", id ? "edit" : "create", ret);
  if (!str(fd, "name")) back(ret, { error: "required" });
  await run(ret, () =>
    id
      ? sql()`update work_locations set name = ${str(fd, "name")}, company_id = ${int(fd, "company_id")}, mode = ${str(fd, "mode") || "gps"},
               lat = ${num(fd, "lat")}, lng = ${num(fd, "lng")}, radius_m = ${int(fd, "radius_m") ?? 200}, active = ${bool(fd, "active")} where id = ${id}`
      : sql()`insert into work_locations (name, company_id, mode, lat, lng, radius_m)
               values (${str(fd, "name")}, ${int(fd, "company_id")}, ${str(fd, "mode") || "gps"}, ${num(fd, "lat")}, ${num(fd, "lng")}, ${int(fd, "radius_m") ?? 200})`,
  );
}

export async function deleteLocation(fd: FormData) {
  await guard("settings.time", "delete", "/settings/locations");
  await run("/settings/locations", () => sql()`delete from work_locations where id = ${int(fd, "id")}`);
}

/* ---------------- 2.3 Holiday calendars ---------------- */

export async function saveCalendar(fd: FormData) {
  const id = int(fd, "id");
  const ret = `/settings/calendars${id ? `?cal=${id}` : ""}`;
  await guard("settings.time", id ? "edit" : "create", ret);
  if (!str(fd, "name")) back(ret, { error: "required" });
  if (bool(fd, "is_default")) await sql()`update holiday_calendars set is_default = false`;
  await run(ret, () =>
    id
      ? sql()`update holiday_calendars set name = ${str(fd, "name")}, company_id = ${int(fd, "company_id")}, is_default = ${bool(fd, "is_default")},
               active = ${bool(fd, "active")} where id = ${id}`
      : sql()`insert into holiday_calendars (name, company_id, is_default) values (${str(fd, "name")}, ${int(fd, "company_id")}, ${bool(fd, "is_default")})`,
  );
}

export async function saveHoliday(fd: FormData) {
  const cal = int(fd, "calendar_id")!;
  const ret = `/settings/calendars?cal=${cal}&year=${str(fd, "year") ?? ""}`;
  await guard("settings.time", "edit", ret);
  if (!date(fd, "holiday_date") || !str(fd, "name")) back(ret, { error: "required" });
  await run(ret, () =>
    sql()`insert into holidays (calendar_id, holiday_date, name, name_en, kind)
          values (${cal}, ${date(fd, "holiday_date")}, ${str(fd, "name")}, ${str(fd, "name_en")}, ${str(fd, "kind") || "traditional"})`,
  );
}

export async function deleteHoliday(fd: FormData) {
  const cal = int(fd, "calendar_id")!;
  const ret = `/settings/calendars?cal=${cal}&year=${str(fd, "year") ?? ""}`;
  await guard("settings.time", "delete", ret);
  await run(ret, () => sql()`delete from holidays where id = ${int(fd, "id")} and calendar_id = ${cal}`);
}

/** Copy a year's holidays to the next year (same day/month) as a starting point. */
export async function copyHolidayYear(fd: FormData) {
  const cal = int(fd, "calendar_id")!;
  const year = int(fd, "year")!;
  const ret = `/settings/calendars?cal=${cal}&year=${year + 1}`;
  await guard("settings.time", "edit", ret);
  await run(ret, () =>
    sql()`
      insert into holidays (calendar_id, holiday_date, name, name_en, kind)
      select calendar_id, (holiday_date + interval '1 year')::date, name, name_en, kind from holidays
      where calendar_id = ${cal} and extract(year from holiday_date) = ${year}
      on conflict do nothing`,
  );
}

export async function assignCalendar(fd: FormData) {
  const cal = int(fd, "calendar_id")!;
  const ret = `/settings/calendars?cal=${cal}&tab=employees`;
  await guard("settings.time", "edit", ret);
  const ids = ints(fd, "employee_ids");
  if (str(fd, "op") === "remove") await sql().query(`update employees set calendar_id = null where id = any($1::int[]) and calendar_id = $2`, [ids, cal]);
  else await sql().query(`update employees set calendar_id = $2 where id = any($1::int[])`, [ids, cal]);
  back(ret);
}

/* ---------------- 2.4 Leave types ---------------- */

export async function saveLeaveType(fd: FormData) {
  const id = int(fd, "id");
  const ret = id ? `/settings/leave-types?id=${id}` : "/settings/leave-types";
  const u = await guard("settings.time", id ? "edit" : "create", ret);
  if (!str(fd, "name")) back(ret, { error: "required" });
  const rules: any = { gender: str(fd, "gender") || "all" };
  for (const k of ["min_minutes", "max_docs_per_day", "backdate_days", "max_consecutive_days", "attach_after_days", "carry_over", "paid_days", "min_balance_minutes", "use_within_days"]) {
    const v = num(fd, k);
    if (v !== null) rules[k] = v;
  }
  for (const k of ["allow_advance", "allow_backdate", "min_half_day", "after_probation", "attach", "paid", "count_holidays", "once", "diligence_keep", "birth_month_only", "count_probation", "allow_checkin", "allow_on_holiday", "holiday_only"])
    rules[k] = bool(fd, k);
  await run(ret, () =>
    id
      ? sql()`update leave_types set name = ${str(fd, "name")}, name_en = ${str(fd, "name_en")}, code = ${str(fd, "code")}, description = ${str(fd, "description")},
               company_id = ${int(fd, "company_id")}, rules = ${JSON.stringify(rules)}::jsonb, sort = ${int(fd, "sort") ?? 0},
               active = ${bool(fd, "active")}, updated_by = ${u.id}, updated_at = now() where id = ${id}`
      : sql()`insert into leave_types (category, base_kind, code, name, name_en, description, company_id, rules, quota, sort, updated_by)
               values (${str(fd, "category") || "leave"}, ${str(fd, "base_kind") || "other"}, ${str(fd, "code")}, ${str(fd, "name")}, ${str(fd, "name_en")},
                 ${str(fd, "description")}, ${int(fd, "company_id")}, ${JSON.stringify(rules)}::jsonb, '{"unit":"day","by":"all","days":0}'::jsonb,
                 ${int(fd, "sort") ?? 50}, ${u.id})`,
  );
}

export async function saveLeaveQuota(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/settings/leave-types?id=${id}&tab=quota`;
  await guard("settings.time", "edit", ret);
  const by = str(fd, "by") || "all";
  const q: any = { unit: str(fd, "unit") || "day", by, days: num(fd, "days") ?? 0, prorate: bool(fd, "prorate") };
  if (by === "tenure") {
    const ys = fd.getAll("tenure_years").map(Number);
    const ds = fd.getAll("tenure_days").map(Number);
    q.tenure = ys.map((y, i) => [y, ds[i]]).filter(([y, d]) => Number.isFinite(y) && Number.isFinite(d) && !(y === 0 && d === 0));
  }
  if (by === "level") {
    q.levels = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("level_") && String(v).trim() !== "") q.levels[k.slice(6)] = Number(v);
  }
  await run(ret, () => sql()`update leave_types set quota = ${JSON.stringify(q)}::jsonb where id = ${id}`);
}

export async function deleteLeaveType(fd: FormData) {
  await guard("settings.time", "delete", "/settings/leave-types");
  await run("/settings/leave-types", () => sql()`update leave_types set active = false where id = ${int(fd, "id")}`);
}

/* ---------------- 3.1 Employment types ---------------- */

export async function saveEmploymentType(fd: FormData) {
  const id = int(fd, "id");
  const ret = `/settings/employment-types${id ? `?id=${id}` : ""}`;
  await guard("settings.payroll", id ? "edit" : "create", ret);
  if (!str(fd, "code") || !str(fd, "name")) back(ret, { error: "required" });
  const calc: any = {};
  for (const k of ["ot", "late", "absent", "forgot", "early", "break_status", "flat_ot"]) calc[k] = bool(fd, "calc_" + k);
  const rates = { ot1: num(fd, "ot1") ?? 1, ot2: num(fd, "ot2") ?? 1.5, ot3: num(fd, "ot3") ?? 2, ot4: num(fd, "ot4") ?? 3 };
  await run(ret, () =>
    id
      ? sql()`update employment_types set code = ${str(fd, "code")}, name = ${str(fd, "name")}, name_en = ${str(fd, "name_en")},
               pay_type = ${str(fd, "pay_type") || "monthly"}, paid_traditional_holiday = ${bool(fd, "paid_traditional_holiday")},
               calc = ${JSON.stringify(calc)}::jsonb, ot_rates = ${JSON.stringify(rates)}::jsonb, active = ${bool(fd, "active")} where id = ${id}`
      : sql()`insert into employment_types (code, name, name_en, pay_type, paid_traditional_holiday, calc, ot_rates)
               values (${str(fd, "code")}, ${str(fd, "name")}, ${str(fd, "name_en")}, ${str(fd, "pay_type") || "monthly"},
                 ${bool(fd, "paid_traditional_holiday")}, ${JSON.stringify(calc)}::jsonb, ${JSON.stringify(rates)}::jsonb)`,
  );
}

/* ---------------- 3.2 Payroll cycles ---------------- */

export async function saveCycle(fd: FormData) {
  const id = int(fd, "id");
  const ret = "/settings/payroll-cycles";
  await guard("settings.payroll", id ? "edit" : "create", ret);
  if (!int(fd, "company_id") || !int(fd, "employment_type_id") || !date(fd, "first_start_date")) back(ret, { error: "required" });
  await run(ret, () =>
    id
      ? sql()`update payroll_cycles set frequency = ${str(fd, "frequency") || "monthly"}, first_start_date = ${date(fd, "first_start_date")},
               pay_rule = ${str(fd, "pay_rule") || "last_day"}, pay_day = ${int(fd, "pay_day")}, off_period_from = ${int(fd, "off_period_from")},
               active = ${bool(fd, "active")} where id = ${id}`
      : sql()`insert into payroll_cycles (company_id, employment_type_id, frequency, first_start_date, pay_rule, pay_day, off_period_from)
               values (${int(fd, "company_id")}, ${int(fd, "employment_type_id")}, ${str(fd, "frequency") || "monthly"}, ${date(fd, "first_start_date")},
                 ${str(fd, "pay_rule") || "last_day"}, ${int(fd, "pay_day")}, ${int(fd, "off_period_from")})`,
  );
}

/* ---------------- 3.3 Pay items ---------------- */

export async function savePayItem(fd: FormData) {
  const id = int(fd, "id");
  const kind = str(fd, "kind") === "deduction" ? "deduction" : "income";
  const ret = `/settings/pay-items?kind=${kind}`;
  await guard("settings.payroll", id ? "edit" : "create", ret);
  if (!str(fd, "code") || !str(fd, "name")) back(ret, { error: "required" });
  const v = {
    code: str(fd, "code"), name: str(fd, "name"), name_en: str(fd, "name_en"), income_type: str(fd, "income_type"),
    tax_mode: str(fd, "tax_mode") || "none", pay_when: str(fd, "pay_when") || "every", rounding: str(fd, "rounding") || "none",
    account_code: str(fd, "account_code"), sort: int(fd, "sort") ?? 50,
  };
  await run(ret, () =>
    id
      ? sql()`update pay_items set code = ${v.code}, name = ${v.name}, name_en = ${v.name_en}, income_type = ${v.income_type}, tax_mode = ${v.tax_mode},
               pay_when = ${v.pay_when}, rounding = ${v.rounding}, in_sso = ${bool(fd, "in_sso")}, in_pf = ${bool(fd, "in_pf")},
               in_ewf = ${bool(fd, "in_ewf")}, in_ot = ${bool(fd, "in_ot")}, account_code = ${v.account_code}, sort = ${v.sort},
               active = ${bool(fd, "active")} where id = ${id}`
      : sql()`insert into pay_items (kind, code, name, name_en, income_type, tax_mode, pay_when, rounding, in_sso, in_pf, in_ewf, in_ot, account_code, sort)
               values (${kind}, ${v.code}, ${v.name}, ${v.name_en}, ${v.income_type}, ${v.tax_mode}, ${v.pay_when}, ${v.rounding},
                 ${bool(fd, "in_sso")}, ${bool(fd, "in_pf")}, ${bool(fd, "in_ewf")}, ${bool(fd, "in_ot")}, ${v.account_code}, ${v.sort})`,
  );
}

/* ---------------- 3.4 Welfare ---------------- */

export async function saveWelfare(fd: FormData) {
  const id = int(fd, "id");
  const ret = "/settings/welfare";
  await guard("settings.payroll", id ? "edit" : "create", ret);
  if (!str(fd, "name")) back(ret, { error: "required" });
  await run(ret, () =>
    id
      ? sql()`update welfare_types set name = ${str(fd, "name")}, description = ${str(fd, "description")}, budget_per_year = ${num(fd, "budget_per_year")},
               pay_item_id = ${int(fd, "pay_item_id")}, after_probation = ${bool(fd, "after_probation")}, active = ${bool(fd, "active")} where id = ${id}`
      : sql()`insert into welfare_types (name, description, budget_per_year, pay_item_id, after_probation)
               values (${str(fd, "name")}, ${str(fd, "description")}, ${num(fd, "budget_per_year")}, ${int(fd, "pay_item_id")}, ${bool(fd, "after_probation")})`,
  );
}

/* ---------------- 3.5 Statutory rates ---------------- */

export async function saveStatutory(fd: FormData) {
  const ret = "/settings/statutory";
  const u = await guard("settings.payroll", "edit", ret);
  await setSetting("sso", {
    base_min: num(fd, "sso_base_min") ?? 1650, base_max: num(fd, "sso_base_max") ?? 17500, min: num(fd, "sso_min") ?? 83,
    max: num(fd, "sso_max") ?? 875, rate_employee: num(fd, "sso_rate_employee") ?? 5, rate_employer: num(fd, "sso_rate_employer") ?? 5,
  });
  await setSetting("ewf", { start: date(fd, "ewf_start") || "2027-01-01", rate_employee: num(fd, "ewf_rate_employee") ?? 0.25, rate_employer: num(fd, "ewf_rate_employer") ?? 0.25 });
  const s = await getSettings();
  await setSetting("tax", { ...s.tax, expense_rate: num(fd, "expense_rate") ?? 50, expense_cap: num(fd, "expense_cap") ?? 100000, personal: num(fd, "personal") ?? 60000 });
  await audit(u.id, "update", "settings", null, { key: "statutory" });
  back(ret);
}

/* ---------------- 4.1 Roles & permissions ---------------- */

export async function saveRole(fd: FormData) {
  const id = int(fd, "id");
  const ret = id ? `/settings/users?tab=roles&role=${id}` : "/settings/users?tab=roles";
  const u = await guard("settings.system", id ? "edit" : "create", ret);
  if (!str(fd, "name") || (!id && !str(fd, "code"))) back(ret, { error: "required" });
  const perms: any = {};
  for (const g of PERM_GROUPS)
    for (const it of g.items) {
      const acts = it.acts.filter((a) => bool(fd, `p:${it.key}:${a}`));
      if (acts.length) perms[it.key] = acts;
    }
  const payroll = strs(fd, "payroll");
  const role = id ? (await sql()`select code from roles where id = ${id}`)[0] : null;
  if (role?.code === "ADMIN") {
    await run(ret, () => sql()`update roles set name = ${str(fd, "name")}, description = ${str(fd, "description")} where id = ${id}`);
    return;
  }
  await run(ret, () =>
    id
      ? sql()`update roles set name = ${str(fd, "name")}, description = ${str(fd, "description")}, is_hr = ${bool(fd, "is_hr")},
               permissions = ${JSON.stringify(perms)}::jsonb, payroll_perms = ${JSON.stringify(payroll)}::jsonb, active = ${bool(fd, "active")}
             where id = ${id}`
      : sql()`insert into roles (code, name, description, is_hr, permissions, payroll_perms)
               values (${str(fd, "code")!.toUpperCase()}, ${str(fd, "name")}, ${str(fd, "description")}, ${bool(fd, "is_hr")},
                 ${JSON.stringify(perms)}::jsonb, ${JSON.stringify(payroll)}::jsonb)`,
  );
  await audit(u.id, "update_role", "role", id);
}

export async function saveGroup(fd: FormData) {
  const id = int(fd, "id");
  const ret = "/settings/users?tab=groups";
  await guard("settings.system", "edit", ret);
  if (!str(fd, "name")) back(ret, { error: "required" });
  let gid = id;
  if (id) await sql()`update user_groups set name = ${str(fd, "name")}, description = ${str(fd, "description")} where id = ${id}`;
  else gid = (await sql()`insert into user_groups (name, description) values (${str(fd, "name")}, ${str(fd, "description")}) returning id`)[0].id;
  await sql()`delete from user_group_members where group_id = ${gid}`;
  for (const e of ints(fd, "member_ids")) await sql()`insert into user_group_members (group_id, employee_id) values (${gid}, ${e})`;
  back(ret);
}

/* ---------------- 4.4 / 4.5 ---------------- */

export async function saveNotificationSettings(fd: FormData) {
  const ret = "/settings/notifications";
  await guard("settings.system", "edit", ret);
  const keys = ["new_starters", "probation_due", "contract_due", "anniversary", "retirement", "birthdays", "work_permit", "profile_done", "action_approved", "separation", "new_employee_to_supervisor", "terminated_disable", "absent_3_days"];
  const v: any = { monthly_day: int(fd, "monthly_day") ?? 1, monthly_recipients: str(fd, "monthly_recipients") || "" };
  for (const k of keys) v[k] = bool(fd, k);
  await setSetting("notifications", v);
  back(ret);
}

export async function saveFeatures(fd: FormData) {
  const ret = "/settings/features";
  await guard("settings.system", "edit", ret);
  const v: any = {};
  for (const k of ["learn", "welfare", "expense", "warning", "actions"]) v[k] = bool(fd, k);
  await setSetting("features", v);
  revalidatePath("/", "layout");
  back(ret);
}
