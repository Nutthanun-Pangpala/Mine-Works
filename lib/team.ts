import { sql } from "./db";
import { teamScope, User } from "./auth";

/** Employees in the viewer's team scope (active), with basic info. */
export async function teamMembers(u: User, includeSelf = false): Promise<any[]> {
  const scope = await teamScope(u);
  if (scope === "all") {
    return sql()`
      select e.id, e.code, e.first_name, e.last_name, e.nickname, e.shift_id, e.supervisor_id, e.org_unit_id,
             p.name as position, ou.name as unit
      from employees e left join positions p on p.id = e.position_id left join org_units ou on ou.id = e.org_unit_id
      where e.status <> 'terminated' order by e.code`;
  }
  const ids = includeSelf ? [...scope, u.id] : scope;
  if (ids.length === 0) return [];
  return sql().query(
    `select e.id, e.code, e.first_name, e.last_name, e.nickname, e.shift_id, e.supervisor_id, e.org_unit_id,
            p.name as position, ou.name as unit
     from employees e left join positions p on p.id = e.position_id left join org_units ou on ou.id = e.org_unit_id
     where e.id = any($1::int[]) order by e.code`,
    [ids],
  );
}
