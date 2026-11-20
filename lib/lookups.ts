import { cache } from "react";
import { sql } from "./db";

export const companies = cache(async () => sql()`select id, code, name_th from companies where active order by id`);
export const branches = cache(async () => sql()`select id, company_id, code, name from branches where active order by company_id, code`);
export const units = cache(async () =>
  sql()`
    with recursive t as (
      select id, company_id, parent_id, kind, name, sort, name::text as path, 0 as depth from org_units where parent_id is null and active
      union all
      select u.id, u.company_id, u.parent_id, u.kind, u.name, u.sort, t.path || ' / ' || u.name, t.depth + 1
      from org_units u join t on u.parent_id = t.id where u.active
    ) select * from t order by company_id, path`,
);
export const levels = cache(async () => sql()`select id, code, name, rank from position_levels order by rank`);
export const positions = cache(async () =>
  sql()`select p.id, p.name, p.level_id, l.code as level_code from positions p left join position_levels l on l.id = p.level_id where p.active order by l.rank nulls last, p.name`,
);
export const shiftsList = cache(async () => sql()`select id, code, name, color from shifts where active order by code`);
export const employmentTypes = cache(async () => sql()`select id, code, name, pay_type from employment_types where active order by id`);
export const calendars = cache(async () => sql()`select id, name, is_default from holiday_calendars where active order by id`);
export const options = cache(async (category: string) =>
  sql()`select id, name, name_en, description from master_options where category = ${category} and active order by sort, id`,
);
export const employeesBrief = cache(async () =>
  sql()`
    select e.id, e.code, e.first_name, e.last_name, e.nickname, e.status, p.name as position
    from employees e left join positions p on p.id = e.position_id
    where e.status <> 'terminated' order by e.code`,
);
export const leaveTypes = cache(async (category?: string) =>
  category
    ? sql()`select * from leave_types where active and category = ${category} order by sort, id`
    : sql()`select * from leave_types where active order by sort, id`,
);
export const payItems = cache(async () => sql()`select * from pay_items where active order by kind desc, sort, code`);
export const roles = cache(async () => sql()`select * from roles order by id`);

export function nextCode(existing: string[], prefix: string, digits: number): string {
  let max = 0;
  for (const c of existing) {
    if (prefix && !c.startsWith(prefix)) continue;
    const n = Number(c.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(digits, "0");
}
