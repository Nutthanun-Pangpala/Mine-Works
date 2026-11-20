import { sql, q, tx } from "./db";
import { notify, audit } from "./log";
import { DOC_TYPES, todayBkk } from "./util";

/**
 * Approval workflows (เวิร์กโฟลว์).
 * A workflow is a list of sequential steps. Each step is one of:
 *   chain_all        every supervisor up the reporting line (อนุมัติทุกลำดับ)
 *   chain_to_level   up the line until someone at/above a position level (อนุมัติถึงระดับตำแหน่ง)
 *   chain_n          first N supervisors (อนุมัติตามจำนวนขั้น)
 *   direct           direct supervisor only (เฉพาะหัวหน้าโดยตรง)
 *   none             no approval required (ไม่ต้องอนุมัติ)
 *   person           a specific employee
 *   role             anyone holding a role (e.g. HR Staff)
 */
export type Step = { mode: string; level_code?: string; n?: number; employee_id?: number; role_code?: string; role_id?: number };

export const STEP_MODES: Record<string, string> = {
  chain_all: "ตามสายบังคับบัญชา – อนุมัติทุกลำดับ",
  chain_to_level: "ตามสายบังคับบัญชา – อนุมัติถึงระดับตำแหน่ง",
  chain_n: "ตามสายบังคับบัญชา – อนุมัติตามจำนวนขั้น",
  direct: "เฉพาะหัวหน้าโดยตรง",
  person: "ระบุผู้อนุมัติ",
  role: "ตามบทบาท",
  none: "ไม่ต้องอนุมัติ",
};

export async function getWorkflow(docType: string, subTypeId: number | null, companyId: number | null): Promise<Step[]> {
  const rows = await sql()`
    select steps, sub_type_id, company_id from workflows
    where doc_type = ${docType}
      and (sub_type_id = ${subTypeId} or sub_type_id is null)
      and (company_id = ${companyId} or company_id is null)
    order by (sub_type_id is null), (company_id is null)
    limit 1`;
  return (rows[0]?.steps as Step[]) || [{ mode: "chain_all" }];
}

type Resolved = { approver_id: number | null; role_id: number | null };

export async function resolveSteps(employeeId: number, steps: Step[]): Promise<Resolved[]> {
  const chain = await sql()`
    with recursive c as (
      select e.supervisor_id as id, 1 as depth from employees e where e.id = ${employeeId}
      union all
      select e.supervisor_id, c.depth + 1 from employees e join c on e.id = c.id
      where c.depth < 12 and e.supervisor_id is not null
    )
    select c.id, c.depth, l.rank
    from c join employees e on e.id = c.id
    left join positions p on p.id = e.position_id
    left join position_levels l on l.id = p.level_id
    where c.id is not null and e.status <> 'terminated'
    order by c.depth`;
  const ids: { id: number; rank: number | null }[] = [];
  for (const r of chain) if (r.id !== employeeId && !ids.some((x) => x.id === r.id)) ids.push({ id: r.id, rank: r.rank });

  const out: Resolved[] = [];
  for (const s of steps) {
    if (s.mode === "none") continue;
    if (s.mode === "direct") {
      if (ids[0]) out.push({ approver_id: ids[0].id, role_id: null });
    } else if (s.mode === "chain_all") {
      for (const x of ids) out.push({ approver_id: x.id, role_id: null });
    } else if (s.mode === "chain_n") {
      for (const x of ids.slice(0, Math.max(1, Number(s.n) || 1))) out.push({ approver_id: x.id, role_id: null });
    } else if (s.mode === "chain_to_level") {
      const lv = await sql()`select rank from position_levels where code = ${s.level_code ?? ""}`;
      const target = lv[0]?.rank ?? 0;
      for (const x of ids) {
        out.push({ approver_id: x.id, role_id: null });
        if (x.rank !== null && x.rank <= target) break;
      }
    } else if (s.mode === "person" && s.employee_id) {
      if (s.employee_id !== employeeId) out.push({ approver_id: Number(s.employee_id), role_id: null });
    } else if (s.mode === "role") {
      let roleId = s.role_id ?? null;
      if (!roleId && s.role_code) {
        const r = await sql()`select id from roles where code = ${s.role_code} and active`;
        roleId = r[0]?.id ?? null;
      }
      // a role nobody holds would leave the document stuck: hand it to the HR fallback instead
      if (roleId && !(await sql()`select 1 from user_roles where role_id = ${roleId} limit 1`)[0]) roleId = await fallbackRole();
      if (roleId) out.push({ approver_id: null, role_id: roleId });
    }
  }
  // drop consecutive duplicates
  const dedup: Resolved[] = [];
  for (const r of out) {
    const last = dedup[dedup.length - 1];
    if (last && last.approver_id === r.approver_id && last.role_id === r.role_id) continue;
    dedup.push(r);
  }
  const wantsApproval = steps.some((s) => s.mode !== "none");
  if (dedup.length === 0 && wantsApproval) {
    // nobody in the line: send to HR
    const hr = await fallbackRole();
    if (hr) dedup.push({ approver_id: null, role_id: hr });
  }
  return dedup;
}

/** HR role that actually has members (HR manager first, then administrators). */
async function fallbackRole(): Promise<number | null> {
  const hr = await sql()`
    select r.id from roles r where (r.is_hr or r.code = 'ADMIN') and r.active
      and exists (select 1 from user_roles ur join employees e on e.id = ur.employee_id where ur.role_id = r.id and e.status <> 'terminated')
    order by (r.code = 'HR_MANAGER') desc, (r.code = 'ADMIN') desc, r.id limit 1`;
  return hr[0]?.id ?? null;
}

export type NewRequest = {
  employee_id: number;
  doc_type: string;
  sub_type_id?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  full_day?: boolean;
  minutes?: number;
  days?: number;
  amount?: number | null;
  reason_id?: number | null;
  detail?: string | null;
  payload?: any;
  file_id?: number | null;
  created_by: number;
};

/** Create a request with its approval steps; auto-approves when no step applies. */
export async function createRequest(r: NewRequest): Promise<number> {
  const emp = await sql()`select company_id, first_name, last_name from employees where id = ${r.employee_id}`;
  const steps = await resolveSteps(r.employee_id, await getWorkflow(r.doc_type, r.sub_type_id ?? null, emp[0]?.company_id ?? null));

  const ins = await sql()`
    insert into requests (employee_id, doc_type, sub_type_id, start_date, end_date, start_time, end_time, full_day,
      minutes, days, amount, reason_id, detail, payload, file_id, created_by)
    values (${r.employee_id}, ${r.doc_type}, ${r.sub_type_id ?? null}, ${r.start_date ?? null}, ${r.end_date ?? null},
      ${r.start_time ?? null}, ${r.end_time ?? null}, ${r.full_day ?? true}, ${r.minutes ?? 0}, ${r.days ?? 0},
      ${r.amount ?? null}, ${r.reason_id ?? null}, ${r.detail ?? null}, ${JSON.stringify(r.payload ?? {})}::jsonb,
      ${r.file_id ?? null}, ${r.created_by})
    returning id`;
  const id = ins[0].id;

  // the creator approves their own step when filing on behalf of someone else
  const creatorRoles = (await sql()`select role_id from user_roles where employee_id = ${r.created_by}`).map((x: any) => x.role_id);
  const queries = [];
  let firstOpen = -1;
  steps.forEach((s, i) => {
    const selfStep =
      r.created_by !== r.employee_id &&
      ((s.approver_id && s.approver_id === r.created_by) || (s.role_id && creatorRoles.includes(s.role_id)));
    let status = "waiting";
    if (selfStep && firstOpen === -1) status = "approved";
    else if (firstOpen === -1) {
      firstOpen = i;
      status = "pending";
    }
    queries.push(q`
      insert into request_steps (request_id, seq, approver_id, role_id, status, decided_by, decided_at)
      values (${id}, ${i + 1}, ${s.approver_id}, ${s.role_id}, ${status},
        ${status === "approved" ? r.created_by : null}, ${status === "approved" ? new Date().toISOString() : null})`);
  });
  if (queries.length) await tx(queries);

  if (firstOpen === -1) {
    await finalize(id, "approved", r.created_by);
  } else {
    const s = steps[firstOpen];
    const name = `${emp[0]?.first_name ?? ""} ${emp[0]?.last_name ?? ""}`;
    await notifyStep(s, `มีเอกสาร${DOC_TYPES[r.doc_type] ?? ""}รออนุมัติ`, `จาก ${name}`);
  }
  await audit(r.created_by, "create", "request", id, { doc_type: r.doc_type });
  return id;
}

async function notifyStep(s: Resolved, title: string, body: string) {
  if (s.approver_id) await notify([s.approver_id], title, body, "/team/approvals");
  else if (s.role_id) {
    const m = await sql()`select employee_id from user_roles where role_id = ${s.role_id}`;
    await notify(m.map((x: any) => x.employee_id), title, body, "/team/approvals");
  }
}

/** Can user decide the current step of a request? */
export async function canDecide(userId: number, roleIds: number[], requestId: number): Promise<any | null> {
  const rows = await sql()`
    select s.* from request_steps s join requests r on r.id = s.request_id
    where s.request_id = ${requestId} and s.status = 'pending' and r.status = 'pending'
      and (s.approver_id = ${userId} or s.role_id = any(${roleIds}::int[]))
    order by s.seq limit 1`;
  return rows[0] ?? null;
}

export async function decide(requestId: number, userId: number, roleIds: number[], approve: boolean, comment: string | null, force = false) {
  let step = await canDecide(userId, roleIds, requestId);
  if (!step && force) {
    const rows = await sql()`select * from request_steps where request_id = ${requestId} and status = 'pending' order by seq limit 1`;
    step = rows[0] ?? null;
  }
  if (!step) return false;
  await sql()`
    update request_steps set status = ${approve ? "approved" : "rejected"}, comment = ${comment},
      decided_by = ${userId}, decided_at = now()
    where id = ${step.id}`;
  const req = (await sql()`select * from requests where id = ${requestId}`)[0];
  if (!approve) {
    await sql()`update request_steps set status = 'skipped' where request_id = ${requestId} and status = 'waiting'`;
    await finalize(requestId, "rejected", userId);
    await notify([req.employee_id, req.created_by], `เอกสาร${DOC_TYPES[req.doc_type] ?? ""}ไม่ได้รับการอนุมัติ`, comment, "/documents");
    return true;
  }
  const next = await sql()`
    select * from request_steps where request_id = ${requestId} and status = 'waiting' order by seq limit 1`;
  if (next[0]) {
    await sql()`update request_steps set status = 'pending' where id = ${next[0].id}`;
    await notifyStep(next[0], `มีเอกสาร${DOC_TYPES[req.doc_type] ?? ""}รออนุมัติ`, "");
  } else {
    await finalize(requestId, "approved", userId);
    await notify([req.employee_id, req.created_by], `เอกสาร${DOC_TYPES[req.doc_type] ?? ""}ได้รับการอนุมัติแล้ว`, null, "/documents");
  }
  await audit(userId, approve ? "approve" : "reject", "request", requestId, { comment });
  return true;
}

async function finalize(requestId: number, status: "approved" | "rejected", userId: number) {
  await sql()`update requests set status = ${status}, decided_at = now() where id = ${requestId}`;
  if (status === "approved") await applyRequest(requestId, userId);
}

export async function cancelRequest(requestId: number, userId: number) {
  await sql()`update requests set status = 'cancelled', decided_at = now() where id = ${requestId} and status in ('pending','approved')`;
  await sql()`update request_steps set status = 'skipped' where request_id = ${requestId} and status in ('pending','waiting')`;
  // undo side effects of shift changes
  const r = (await sql()`select * from requests where id = ${requestId}`)[0];
  if (r?.doc_type === "certify") await sql()`delete from clock_records where source = 'certify' and note = ${"req:" + requestId}`;
  await audit(userId, "cancel", "request", requestId);
}

/** Side effects once a request is fully approved. */
export async function applyRequest(requestId: number, userId: number | null) {
  const r = (await sql()`select *, start_date::text as sd, end_date::text as ed from requests where id = ${requestId}`)[0];
  if (!r || r.status !== "approved" || r.applied_at) return;
  const p = r.payload || {};
  if (r.doc_type === "certify") {
    const ins: any[] = [];
    if (p.in_time) ins.push(q`insert into clock_records (employee_id, ts, source, note) values (${r.employee_id}, ${`${r.sd}T${p.in_time}:00+07:00`}, 'certify', ${"req:" + r.id})`);
    if (p.out_time) {
      const outDate = p.out_next_day ? addOne(r.sd) : r.sd;
      ins.push(q`insert into clock_records (employee_id, ts, source, note) values (${r.employee_id}, ${`${outDate}T${p.out_time}:00+07:00`}, 'certify', ${"req:" + r.id})`);
    }
    if (ins.length) await tx(ins);
  } else if (r.doc_type === "change_shift") {
    const qs: any[] = [];
    for (let d = r.sd; d <= (r.ed || r.sd); d = addOne(d))
      qs.push(q`insert into shift_assignments (employee_id, work_date, shift_id) values (${r.employee_id}, ${d}, ${p.shift_id ?? null})
                on conflict (employee_id, work_date) do update set shift_id = excluded.shift_id`);
    if (qs.length) await tx(qs);
  } else if (r.doc_type === "swap_shift") {
    const other = Number(p.with_employee_id);
    if (other) {
      const { shiftOn } = await import("./attendance");
      const a = await shiftOn(r.employee_id, r.sd);
      const b = await shiftOn(other, r.sd);
      await tx([
        q`insert into shift_assignments (employee_id, work_date, shift_id) values (${r.employee_id}, ${r.sd}, ${b})
          on conflict (employee_id, work_date) do update set shift_id = excluded.shift_id`,
        q`insert into shift_assignments (employee_id, work_date, shift_id) values (${other}, ${r.sd}, ${a})
          on conflict (employee_id, work_date) do update set shift_id = excluded.shift_id`,
      ]);
    }
  } else if (r.doc_type === "action") {
    if (!r.sd || r.sd <= todayBkk()) {
      const { applyAction } = await import("./personnel");
      await applyAction(r, userId);
    } else return; // applied later by applyDueActions()
  }
  await sql()`update requests set applied_at = now() where id = ${requestId}`;
}

function addOne(d: string): string {
  return new Date(Date.parse(d + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
}
