import { sql } from "./db";

export async function audit(actorId: number | null, action: string, entity: string, entityId: number | null, detail?: any) {
  try {
    await sql()`
      insert into audit_logs (actor_id, action, entity, entity_id, detail)
      values (${actorId}, ${action}, ${entity}, ${entityId}, ${detail ? JSON.stringify(detail) : null}::jsonb)`;
  } catch {
    // auditing must never break the main action
  }
}

export async function notify(employeeIds: (number | null | undefined)[], title: string, body?: string | null, link?: string | null) {
  const ids = [...new Set(employeeIds.filter((x): x is number => !!x))];
  if (ids.length === 0) return;
  try {
    await sql().query(
      `insert into notifications (employee_id, title, body, link)
       select x, $2, $3, $4 from unnest($1::int[]) as x`,
      [ids, title, body ?? null, link ?? null],
    );
  } catch {
    // ignore
  }
}
