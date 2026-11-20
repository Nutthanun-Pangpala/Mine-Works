"use server";

import { redirect } from "next/navigation";
import { sql, q, tx } from "@/lib/db";
import { can, requireUser, teamScope } from "@/lib/auth";
import { date, int, ints, num, str } from "@/lib/form";
import { back } from "@/lib/nav";
import { createRequest } from "@/lib/workflow";
import { audit } from "@/lib/log";
import { eachDay } from "@/lib/util";

/** จัดการกะ: assign a shift (or day off) to team members for a date range. */
export async function assignShifts(fd: FormData) {
  const u = await requireUser();
  const ret = str(fd, "back") || "/team/schedule";
  if (!can(u, "team", "create")) back(ret, { error: "forbidden" });
  const scope = await teamScope(u);
  const emps = ints(fd, "employee_ids").filter((id) => scope === "all" || scope.includes(id));
  const from = date(fd, "from");
  const to = date(fd, "to") || from;
  const shiftRaw = str(fd, "shift_id");
  if (!emps.length || !from || !to || to < from || eachDay(from, to).length > 93) back(ret, { error: "invalid" });
  const shiftId = shiftRaw === "off" ? null : Number(shiftRaw);
  const clear = shiftRaw === "default";
  const qs: any[] = [];
  for (const e of emps)
    for (const d of eachDay(from!, to!)) {
      if (clear) qs.push(q`delete from shift_assignments where employee_id = ${e} and work_date = ${d}`);
      else
        qs.push(q`insert into shift_assignments (employee_id, work_date, shift_id) values (${e}, ${d}, ${shiftId})
                  on conflict (employee_id, work_date) do update set shift_id = excluded.shift_id`);
    }
  await tx(qs);
  await audit(u.id, "assign_shift", "shift_assignments", null, { emps, from, to, shiftRaw });
  back(ret);
}

/** Create a personnel action (การดำเนินการ) that goes through the 'action' workflow. */
export async function createAction(fd: FormData) {
  const u = await requireUser();
  const ret = str(fd, "back") || "/team/actions";
  if (!can(u, "team.actions", "create")) back(ret, { error: "forbidden" });
  const employeeId = int(fd, "employee_id");
  const kind = str(fd, "kind");
  const eff = date(fd, "effective_date");
  if (!employeeId || !kind || !eff) back(ret, { error: "required" });
  const scope = await teamScope(u);
  if (scope !== "all" && !scope.includes(employeeId!)) back(ret, { error: "forbidden" });
  const payload: any = { kind };
  for (const k of ["position_id", "org_unit_id", "branch_id", "company_id", "supervisor_id", "employment_type_id", "employee_type_id", "shift_id", "separation_reason_id"]) {
    const v = int(fd, k);
    if (v) payload[k] = v;
  }
  const sal = num(fd, "salary_after");
  if (sal) payload.salary_after = sal;
  const ced = date(fd, "contract_end_date");
  if (ced) payload.contract_end_date = ced;
  const ped = date(fd, "probation_end_date");
  if (ped) payload.probation_end_date = ped;
  if (kind === "salary_adjust" && !sal) back(ret, { error: "required" });
  const cur = (await sql()`select salary, position_id, supervisor_id, org_unit_id from employees where id = ${employeeId}`)[0];
  payload.before = cur;
  const id = await createRequest({
    employee_id: employeeId!,
    doc_type: "action",
    start_date: eff,
    end_date: eff,
    detail: str(fd, "detail"),
    payload,
    created_by: u.id,
  });
  redirect(`/documents/${id}?ok=1`);
}
