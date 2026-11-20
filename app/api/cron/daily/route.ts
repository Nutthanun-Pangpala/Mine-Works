// Daily HR housekeeping (run by Vercel Cron, see vercel.json):
// applies personnel actions that became effective and sends the reminders enabled in Settings → Notifications.
import { sql } from "@/lib/db";
import { notify } from "@/lib/log";
import { applyDueActions } from "@/lib/personnel";
import { getSettings } from "@/lib/settings";
import { computeAttendance } from "@/lib/attendance";
import { addDays, fd, fullName, todayBkk } from "@/lib/util";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  const today = todayBkk();
  const s = (await getSettings()).notifications || {};
  const hr = (await sql()`select distinct ur.employee_id as id from user_roles ur join roles r on r.id = ur.role_id
                          join employees e on e.id = ur.employee_id where r.is_hr and r.active and e.status <> 'terminated'`).map((r: any) => r.id);
  const sent: Record<string, number> = {};
  const send = async (key: string, ids: (number | null)[], title: string, link: string) => {
    await notify(ids, title, null, link);
    sent[key] = (sent[key] || 0) + 1;
  };

  await applyDueActions();
  const emps = await sql()`
    select id, code, title, first_name, last_name, supervisor_id, start_date::text as sd, probation_end_date::text as pd, contract_end_date::text as ced,
           birth_date::text as bd, work_permit_expiry::text as wpe, status
    from employees where status in ('pending','probation','confirmed')`;

  for (const e of emps) {
    const link = `/employees/${e.id}`;
    const name = `${e.code} ${fullName(e)}`;
    if (s.new_starters && e.sd === today) await send("new_starters", [...hr, e.supervisor_id], `พนักงานเริ่มงานวันนี้: ${name}`, link);
    if (s.probation_due && e.status === "probation" && e.pd === addDays(today, 7))
      await send("probation_due", [...hr, e.supervisor_id], `${name} จะครบกำหนดทดลองงานวันที่ ${fd(e.pd)}`, link);
    if (s.contract_due && e.ced === addDays(today, 30)) await send("contract_due", hr, `สัญญาจ้างของ ${name} จะสิ้นสุดวันที่ ${fd(e.ced)}`, link);
    if (s.work_permit && e.wpe === addDays(today, 30)) await send("work_permit", hr, `ใบอนุญาตทำงานของ ${name} จะหมดอายุวันที่ ${fd(e.wpe)}`, link);
    if (s.birthdays && e.bd && e.bd.slice(5) === today.slice(5)) {
      await send("birthdays", [e.id], "สุขสันต์วันเกิด 🎂 ขอให้มีความสุขมากๆ", "/");
      await send("birthdays", hr, `วันนี้วันเกิด ${name}`, link);
    }
    if (s.anniversary && e.sd && e.sd < today && e.sd.slice(5) === today.slice(5)) {
      const years = Number(today.slice(0, 4)) - Number(e.sd.slice(0, 4));
      await send("anniversary", [e.id, ...hr], `ครบรอบการทำงาน ${years} ปี: ${name}`, link);
    }
    if (s.retirement && e.bd) {
      const retire = `${Number(e.bd.slice(0, 4)) + 60}${e.bd.slice(4)}`;
      if (retire === addDays(today, 30)) await send("retirement", hr, `${name} จะเกษียณอายุ (60 ปี) วันที่ ${fd(retire)}`, link);
    }
  }

  if (s.absent_3_days) {
    const from = addDays(today, -7);
    const ids = emps.filter((e: any) => e.status !== "pending").map((e: any) => e.id);
    const att = await computeAttendance(ids, from, addDays(today, -1));
    for (const e of emps) {
      const days = (att.get(e.id) || []).filter((d) => d.kind === "work");
      const last3 = days.slice(-3);
      if (last3.length === 3 && last3.every((d) => d.absent) && last3[2].date === addDays(today, -1))
        await send("absent_3_days", [...hr, e.supervisor_id], `${e.code} ${fullName(e)} ขาดงานติดต่อกัน 3 วันทำงาน`, `/employees/${e.id}/time`);
    }
  }
  return Response.json({ ok: true, date: today, sent });
}
