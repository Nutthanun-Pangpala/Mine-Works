"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import {
  canApprove,
  createSession,
  destroySession,
  hashPassword,
  isHR,
  requireUser,
  verifyPassword,
} from "@/lib/auth";
import { distanceM, isDate } from "@/lib/util";

const str = (fd: FormData, k: string): string | null => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

const num = (fd: FormData, k: string): number | null => {
  const v = str(fd, k);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const dateOrNull = (fd: FormData, k: string): string | null => {
  const v = str(fd, k);
  return isDate(v) ? v : null;
};

/* ---------- Auth ---------- */

export async function login(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const rows = await sql()`
    select id, password_hash from employees where lower(email) = ${email} and status = 'active'`;
  if (!rows[0] || !verifyPassword(password, rows[0].password_hash)) redirect("/login?error=login");
  await createSession(rows[0].id);
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
  if (next.length < 8) redirect("/profile?error=password");
  const rows = await sql()`select password_hash from employees where id = ${u.id}`;
  if (!verifyPassword(current, rows[0].password_hash)) redirect("/profile?error=wrongpassword");
  await sql()`update employees set password_hash = ${hashPassword(next)} where id = ${u.id}`;
  redirect("/profile?ok=1");
}

/* ---------- Employees ---------- */

export async function saveEmployee(fd: FormData) {
  const u = await requireUser();
  if (!isHR(u)) redirect("/?error=forbidden");

  const id = num(fd, "id");
  const back = id ? `/employees/${id}` : "/employees/new";

  let role = str(fd, "role") || "employee";
  if (!["admin", "hr", "manager", "employee"].includes(role)) role = "employee";
  let status = str(fd, "status") === "resigned" ? "resigned" : "active";
  let employmentType = str(fd, "employment_type") || "fulltime";
  if (!["fulltime", "probation", "contract", "parttime"].includes(employmentType)) employmentType = "fulltime";

  if (id) {
    const target = await sql()`select role from employees where id = ${id}`;
    if (!target[0]) redirect("/employees");
    // Only an admin may edit an admin account or grant the admin role
    if (target[0].role === "admin" && u.role !== "admin") redirect(`${back}?error=forbidden`);
    if (id === u.id) {
      // Nobody changes their own role or deactivates themselves
      role = u.role;
      status = "active";
    }
  }
  if (role === "admin" && u.role !== "admin") redirect(`${back}?error=forbidden`);

  const code = str(fd, "code");
  const email = str(fd, "email")?.toLowerCase() ?? null;
  const firstName = str(fd, "first_name");
  const lastName = str(fd, "last_name");
  const password = str(fd, "password");
  if (!code || !email || !firstName || !lastName) redirect(`${back}?error=required`);
  if ((!id && !password) || (password && password.length < 8)) redirect(`${back}?error=password`);

  const nickname = str(fd, "nickname");
  const phone = str(fd, "phone");
  const departmentId = num(fd, "department_id");
  const positionId = num(fd, "position_id");
  const branchId = num(fd, "branch_id");
  const shiftId = num(fd, "shift_id");
  let managerId = num(fd, "manager_id");
  if (id && managerId === id) managerId = null;
  const startDate = dateOrNull(fd, "start_date");
  const endDate = dateOrNull(fd, "end_date");
  const birthDate = dateOrNull(fd, "birth_date");

  let error: string | null = null;
  let newId = id;
  try {
    if (id) {
      await sql()`
        update employees set
          code = ${code}, email = ${email}, role = ${role}, first_name = ${firstName}, last_name = ${lastName},
          nickname = ${nickname}, phone = ${phone}, department_id = ${departmentId}, position_id = ${positionId},
          branch_id = ${branchId}, shift_id = ${shiftId}, manager_id = ${managerId},
          employment_type = ${employmentType}, start_date = ${startDate}, end_date = ${endDate},
          birth_date = ${birthDate}, status = ${status}
        where id = ${id}`;
      if (password) {
        await sql()`update employees set password_hash = ${hashPassword(password)} where id = ${id}`;
      }
    } else {
      const rows = await sql()`
        insert into employees
          (code, email, password_hash, role, first_name, last_name, nickname, phone, department_id, position_id,
           branch_id, shift_id, manager_id, employment_type, start_date, end_date, birth_date, status)
        values
          (${code}, ${email}, ${hashPassword(password as string)}, ${role}, ${firstName}, ${lastName}, ${nickname},
           ${phone}, ${departmentId}, ${positionId}, ${branchId}, ${shiftId}, ${managerId}, ${employmentType},
           ${startDate}, ${endDate}, ${birthDate}, ${status})
        returning id`;
      newId = rows[0].id;
    }
  } catch (e: any) {
    error = /unique|duplicate/i.test(String(e?.message)) ? "duplicate" : "failed";
  }
  if (error) redirect(`${back}?error=${error}`);
  revalidatePath("/employees");
  redirect(`/employees/${newId}?ok=1`);
}

/* ---------- Organisation settings ---------- */

const ORG_TABLES: Record<string, string> = {
  branch: "branches",
  department: "departments",
  position: "positions",
  shift: "shifts",
  leave_type: "leave_types",
};

export async function addOrgItem(fd: FormData) {
  const u = await requireUser();
  if (!isHR(u)) redirect("/?error=forbidden");
  const kind = str(fd, "kind");
  const name = str(fd, "name");
  if (!kind || !ORG_TABLES[kind] || !name) redirect("/org?error=required");

  let error: string | null = null;
  try {
    if (kind === "branch") {
      await sql()`insert into branches (name, lat, lng, radius_m)
        values (${name}, ${num(fd, "lat")}, ${num(fd, "lng")}, ${num(fd, "radius_m")})`;
    } else if (kind === "department") {
      await sql()`insert into departments (name) values (${name})`;
    } else if (kind === "position") {
      await sql()`insert into positions (name) values (${name})`;
    } else if (kind === "shift") {
      const start = str(fd, "start_time");
      const end = str(fd, "end_time");
      if (!start || !end) error = "required";
      else
        await sql()`insert into shifts (name, start_time, end_time, grace_min)
          values (${name}, ${start}, ${end}, ${num(fd, "grace_min") ?? 0})`;
    } else if (kind === "leave_type") {
      const days = num(fd, "days_per_year");
      if (days === null || days < 0) error = "required";
      else await sql()`insert into leave_types (name, days_per_year) values (${name}, ${days})`;
    }
  } catch (e: any) {
    error = /unique|duplicate/i.test(String(e?.message)) ? "duplicate" : "failed";
  }
  if (error) redirect(`/org?error=${error}`);
  revalidatePath("/org");
  redirect("/org?ok=1");
}

export async function deleteOrgItem(fd: FormData) {
  const u = await requireUser();
  if (!isHR(u)) redirect("/?error=forbidden");
  const table = ORG_TABLES[str(fd, "kind") || ""];
  const id = num(fd, "id");
  if (!table || !id) redirect("/org?error=invalid");
  let error: string | null = null;
  try {
    await sql().query(`delete from ${table} where id = $1`, [id]);
  } catch {
    error = "inuse";
  }
  if (error) redirect(`/org?error=${error}`);
  revalidatePath("/org");
  redirect("/org?ok=1");
}

/* ---------- Attendance ---------- */

async function locate(u: any, fd: FormData) {
  const lat = num(fd, "lat");
  const lng = num(fd, "lng");
  const rows = await sql()`
    select s.start_time, s.grace_min, b.lat, b.lng
    from employees e
    left join shifts s on s.id = e.shift_id
    left join branches b on b.id = e.branch_id
    where e.id = ${u.id}`;
  const info = rows[0] || {};
  let dist: number | null = null;
  if (lat !== null && lng !== null && info.lat != null && info.lng != null) {
    dist = distanceM(lat, lng, Number(info.lat), Number(info.lng));
  }
  return { lat, lng, dist, start: info.start_time ?? null, grace: info.grace_min ?? 0 };
}

export async function checkIn(fd: FormData) {
  const u = await requireUser();
  const p = await locate(u, fd);
  await sql()`
    insert into attendance (employee_id, work_date, check_in, in_lat, in_lng, in_distance_m, late_minutes)
    values (
      ${u.id},
      (now() at time zone 'Asia/Bangkok')::date,
      now(),
      ${p.lat}, ${p.lng}, ${p.dist},
      case when ${p.start}::time is null then 0
           else greatest(0, floor(extract(epoch from ((now() at time zone 'Asia/Bangkok')::time - ${p.start}::time)) / 60)::int - ${p.grace}::int)
      end
    )
    on conflict (employee_id, work_date) do nothing`;
  revalidatePath("/");
  redirect("/attendance?ok=1");
}

export async function checkOut(fd: FormData) {
  const u = await requireUser();
  const p = await locate(u, fd);
  const rows = await sql()`
    update attendance set check_out = now(), out_lat = ${p.lat}, out_lng = ${p.lng}, out_distance_m = ${p.dist}
    where employee_id = ${u.id} and work_date = (now() at time zone 'Asia/Bangkok')::date
    returning id`;
  if (!rows[0]) redirect("/attendance?error=nocheckin");
  revalidatePath("/");
  redirect("/attendance?ok=1");
}

/* ---------- Leave ---------- */

export async function requestLeave(fd: FormData) {
  const u = await requireUser();
  const typeId = num(fd, "leave_type_id");
  const start = dateOrNull(fd, "start_date");
  const end = dateOrNull(fd, "end_date");
  const reason = str(fd, "reason");
  if (!typeId || !start || !end || end < start) redirect("/leave?error=invalid");

  const type = await sql()`select days_per_year::float as quota from leave_types where id = ${typeId}`;
  if (!type[0]) redirect("/leave?error=invalid");

  // Working days = Monday to Friday, minus company holidays
  const counted = await sql()`
    select count(*)::int as days
    from generate_series(${start}::date, ${end}::date, interval '1 day') d
    where extract(isodow from d) < 6
      and d::date not in (select holiday_date from holidays)`;
  const days = counted[0].days;
  if (days === 0) redirect("/leave?error=nodays");

  const overlap = await sql()`
    select 1 from leave_requests
    where employee_id = ${u.id} and status in ('pending','approved')
      and start_date <= ${end}::date and end_date >= ${start}::date
    limit 1`;
  if (overlap[0]) redirect("/leave?error=overlap");

  const used = await sql()`
    select coalesce(sum(days), 0)::float as used from leave_requests
    where employee_id = ${u.id} and leave_type_id = ${typeId} and status in ('pending','approved')
      and extract(year from start_date) = extract(year from ${start}::date)`;
  if (used[0].used + days > type[0].quota) redirect("/leave?error=quota");

  await sql()`
    insert into leave_requests (employee_id, leave_type_id, start_date, end_date, days, reason)
    values (${u.id}, ${typeId}, ${start}, ${end}, ${days}, ${reason})`;
  revalidatePath("/leave");
  redirect("/leave?ok=1");
}

export async function decideLeave(fd: FormData) {
  const u = await requireUser();
  const id = num(fd, "id");
  const status = str(fd, "decision") === "approve" ? "approved" : "rejected";
  const rows = await sql()`
    select lr.employee_id, e.manager_id
    from leave_requests lr join employees e on e.id = lr.employee_id
    where lr.id = ${id} and lr.status = 'pending'`;
  if (!rows[0] || !canApprove(u, rows[0])) redirect("/leave?error=forbidden");
  await sql()`
    update leave_requests set status = ${status}, approver_id = ${u.id}, decided_at = now()
    where id = ${id} and status = 'pending'`;
  revalidatePath("/leave");
  redirect("/leave?ok=1");
}

export async function cancelLeave(fd: FormData) {
  const u = await requireUser();
  const id = num(fd, "id");
  await sql()`
    update leave_requests set status = 'cancelled'
    where id = ${id} and employee_id = ${u.id} and status = 'pending'`;
  revalidatePath("/leave");
  redirect("/leave?ok=1");
}

/* ---------- Overtime ---------- */

export async function requestOT(fd: FormData) {
  const u = await requireUser();
  const date = dateOrNull(fd, "work_date");
  const hours = num(fd, "hours");
  const reason = str(fd, "reason");
  if (!date || hours === null || hours <= 0 || hours > 24) redirect("/ot?error=invalid");
  await sql()`
    insert into ot_requests (employee_id, work_date, hours, reason)
    values (${u.id}, ${date}, ${hours}, ${reason})`;
  revalidatePath("/ot");
  redirect("/ot?ok=1");
}

export async function decideOT(fd: FormData) {
  const u = await requireUser();
  const id = num(fd, "id");
  const status = str(fd, "decision") === "approve" ? "approved" : "rejected";
  const rows = await sql()`
    select o.employee_id, e.manager_id
    from ot_requests o join employees e on e.id = o.employee_id
    where o.id = ${id} and o.status = 'pending'`;
  if (!rows[0] || !canApprove(u, rows[0])) redirect("/ot?error=forbidden");
  await sql()`
    update ot_requests set status = ${status}, approver_id = ${u.id}, decided_at = now()
    where id = ${id} and status = 'pending'`;
  revalidatePath("/ot");
  redirect("/ot?ok=1");
}

export async function cancelOT(fd: FormData) {
  const u = await requireUser();
  const id = num(fd, "id");
  await sql()`
    update ot_requests set status = 'cancelled'
    where id = ${id} and employee_id = ${u.id} and status = 'pending'`;
  revalidatePath("/ot");
  redirect("/ot?ok=1");
}

/* ---------- Holidays ---------- */

export async function addHoliday(fd: FormData) {
  const u = await requireUser();
  if (!isHR(u)) redirect("/?error=forbidden");
  const date = dateOrNull(fd, "holiday_date");
  const name = str(fd, "name");
  if (!date || !name) redirect("/holidays?error=required");
  let error: string | null = null;
  try {
    await sql()`insert into holidays (holiday_date, name) values (${date}, ${name})`;
  } catch (e: any) {
    error = /unique|duplicate/i.test(String(e?.message)) ? "duplicate" : "failed";
  }
  if (error) redirect(`/holidays?error=${error}`);
  revalidatePath("/holidays");
  redirect("/holidays?ok=1");
}

export async function deleteHoliday(fd: FormData) {
  const u = await requireUser();
  if (!isHR(u)) redirect("/?error=forbidden");
  await sql()`delete from holidays where id = ${num(fd, "id")}`;
  revalidatePath("/holidays");
  redirect("/holidays?ok=1");
}
