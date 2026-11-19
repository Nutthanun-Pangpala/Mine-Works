import { sql } from "./db";
import { audit, notify } from "./log";
import { ACTION_KINDS, todayBkk } from "./util";

/**
 * Personnel actions (การดำเนินการ) are requests with doc_type = 'action'.
 * payload: { kind, position_id, org_unit_id, branch_id, company_id, supervisor_id,
 *            salary_after, employment_type_id, employee_type_id, shift_id,
 *            contract_end_date, separation_reason_id, start_date }
 * start_date of the request is the effective date.
 */
export async function applyAction(r: any, userId: number | null) {
  const p = r.payload || {};
  const id = r.employee_id;
  const eff = r.sd || r.start_date || todayBkk();
  const cur = (await sql()`select * from employees where id = ${id}`)[0];
  if (!cur) return;

  const setSalary = async (after: number, action: string) => {
    if (!Number.isFinite(after) || after <= 0) return;
    await sql()`update employees set salary = ${after}, updated_at = now() where id = ${id}`;
    await sql()`
      insert into salary_history (employee_id, kind, effective_date, action, amount_before, amount_after, note, created_by)
      values (${id}, 'salary', ${eff}, ${action}, ${cur.salary}, ${after}, ${r.detail ?? null}, ${userId})`;
  };

  switch (p.kind) {
    case "confirm":
      await sql()`update employees set status = 'confirmed', confirm_date = ${eff}, updated_at = now() where id = ${id}`;
      if (p.salary_after) await setSalary(Number(p.salary_after), ACTION_KINDS.confirm);
      break;
    case "promote":
      await sql()`update employees set position_id = coalesce(${p.position_id ?? null}::int, position_id), updated_at = now() where id = ${id}`;
      if (p.salary_after) await setSalary(Number(p.salary_after), ACTION_KINDS.promote);
      break;
    case "salary_adjust":
      await setSalary(Number(p.salary_after), ACTION_KINDS.salary_adjust);
      break;
    case "change_supervisor":
      await sql()`update employees set supervisor_id = ${p.supervisor_id ?? null}, updated_at = now() where id = ${id}`;
      break;
    case "transfer_unit":
      await sql()`
        update employees set org_unit_id = coalesce(${p.org_unit_id ?? null}::int, org_unit_id),
          branch_id = coalesce(${p.branch_id ?? null}::int, branch_id),
          supervisor_id = coalesce(${p.supervisor_id ?? null}::int, supervisor_id), updated_at = now()
        where id = ${id}`;
      break;
    case "transfer_company":
      await sql()`
        update employees set company_id = coalesce(${p.company_id ?? null}::int, company_id),
          org_unit_id = ${p.org_unit_id ?? null}, branch_id = ${p.branch_id ?? null},
          supervisor_id = coalesce(${p.supervisor_id ?? null}::int, supervisor_id), updated_at = now()
        where id = ${id}`;
      break;
    case "change_terms":
      await sql()`
        update employees set
          employment_type_id = coalesce(${p.employment_type_id ?? null}::int, employment_type_id),
          employee_type_id = coalesce(${p.employee_type_id ?? null}::int, employee_type_id),
          shift_id = coalesce(${p.shift_id ?? null}::int, shift_id),
          contract_end_date = coalesce(${p.contract_end_date ?? null}::date, contract_end_date),
          updated_at = now()
        where id = ${id}`;
      if (p.salary_after) await setSalary(Number(p.salary_after), ACTION_KINDS.change_terms);
      break;
    case "terminate":
      await sql()`
        update employees set status = 'terminated', end_date = ${eff}, separation_reason_id = ${p.separation_reason_id ?? null},
          separation_note = ${r.detail ?? null}, login_enabled = false, updated_at = now()
        where id = ${id}`;
      // subordinates move up to the leaver's supervisor
      await sql()`update employees set supervisor_id = ${cur.supervisor_id} where supervisor_id = ${id}`;
      await sql()`update liabilities set active = false where employee_id = ${id}`;
      break;
    case "rehire":
      await sql()`
        update employees set status = 'probation', start_date = ${eff}, end_date = null, confirm_date = null,
          probation_end_date = ${p.probation_end_date ?? null}, separation_reason_id = null, login_enabled = true,
          position_id = coalesce(${p.position_id ?? null}::int, position_id), updated_at = now()
        where id = ${id}`;
      if (p.salary_after) await setSalary(Number(p.salary_after), ACTION_KINDS.rehire);
      break;
  }
  await audit(userId, "apply_action", "employee", id, { kind: p.kind, request: r.id });
  await notify([id], `${ACTION_KINDS[p.kind] ?? "การดำเนินการ"}มีผลแล้ว`, null, `/employees/${id}`);
}

/** Apply approved actions whose effective date has arrived. Cheap; safe to call often. */
export async function applyDueActions() {
  const due = await sql()`
    select *, start_date::text as sd from requests
    where doc_type = 'action' and status = 'approved' and applied_at is null and (start_date is null or start_date <= ${todayBkk()})
    order by start_date, id limit 50`;
  for (const r of due) {
    await applyAction(r, null);
    await sql()`update requests set applied_at = now() where id = ${r.id}`;
  }
}
