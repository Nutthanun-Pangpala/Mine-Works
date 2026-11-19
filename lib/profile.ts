import { notFound } from "next/navigation";
import { can, requireUser, subordinateIds, User } from "./auth";
import { sql } from "./db";

/** Load an employee for profile pages and decide what the viewer may see/edit. */
export async function loadProfile(idParam: string) {
  const u = await requireUser();
  const id = Number(idParam);
  const e = (
    await sql()`
      select e.*, e.start_date::text as sd, e.end_date::text as ed, e.birth_date::text as bd,
             e.probation_end_date::text as ped, e.confirm_date::text as cd, e.contract_end_date::text as ced,
             p.name as position, l.code as level, ou.name as unit, c.name_th as company, b.name as branch,
             s.code as shift_code, s.name as shift_name, et.name as emp_type, et.pay_type, mo.name as etype,
             sup.first_name as sup_first, sup.last_name as sup_last, cal.name as calendar
      from employees e
      left join positions p on p.id = e.position_id left join position_levels l on l.id = p.level_id
      left join org_units ou on ou.id = e.org_unit_id left join companies c on c.id = e.company_id
      left join branches b on b.id = e.branch_id left join shifts s on s.id = e.shift_id
      left join employment_types et on et.id = e.employment_type_id left join master_options mo on mo.id = e.employee_type_id
      left join employees sup on sup.id = e.supervisor_id left join holiday_calendars cal on cal.id = e.calendar_id
      where e.id = ${id}`
  )[0];
  if (!e) notFound();
  const self = u.id === id;
  const hr = can(u, "employees");
  const sup = !self && !hr && u.isSupervisor ? (await subordinateIds(u.id)).includes(id) : false;
  if (!self && !hr && !sup) notFound();
  return {
    u,
    e,
    self,
    canEdit: can(u, "employees", "edit"),
    canPersonal: can(u, "employees.personal", "edit"),
    seeSalary: can(u, "employees.salary") || self,
    canSalary: can(u, "employees.salary", "edit"),
    canAccount: can(u, "settings.system", "edit"),
    hr,
  };
}

export type Profile = Awaited<ReturnType<typeof loadProfile>>;
export type { User };
