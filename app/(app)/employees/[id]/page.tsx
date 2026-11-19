import Link from "next/link";
import { sql } from "@/lib/db";
import { loadProfile } from "@/lib/profile";
import { computeAttendance, summarize } from "@/lib/attendance";
import { ACTION_KINDS, DOC_TYPES, REQ_STATUS, addDays, age, fd, fullName, money, todayBkk } from "@/lib/util";
import { deleteEmployee } from "@/app/actions/employees";
import Notice from "@/components/Notice";
import ConfirmButton from "@/components/ConfirmButton";

export default async function Overview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { e, u, hr } = await loadProfile(id);
  const today = todayBkk();
  const from = addDays(today, -29);
  const [team, journey, att] = await Promise.all([
    sql()`select count(*)::int as n from employees where supervisor_id = ${e.id} and status <> 'terminated'`,
    sql()`
      (select 'history' as k, effective_date::text as d, action as title, amount_after as amount, null::text as kind from salary_history where employee_id = ${e.id})
      union all
      (select 'action', start_date::text, null, null, payload->>'kind' from requests where employee_id = ${e.id} and doc_type = 'action' and status = 'approved')
      union all
      (select 'doc', start_date::text, doc_type, null, status from requests where employee_id = ${e.id} and doc_type in ('warning'))
      order by d desc nulls last limit 20`,
    computeAttendance([e.id], from, today),
  ]);
  const s = summarize(att.get(e.id) || []);
  const score = Math.max(0, 100 - s.absent_days * 10 - s.late_count * 2 - s.missing * 5);
  const showMoney = hr || u.id === e.id;
  return (
    <>
      <Notice sp={sp} />
      <div className="card">
        <h2>เกี่ยวกับ</h2>
        <dl className="info">
          <dt>สถานะ / ประเภท</dt>
          <dd>{e.etype || e.emp_type || "-"}</dd>
          <dt>กะทำงาน</dt>
          <dd>{e.shift_code ? `${e.shift_code} - ${e.shift_name}` : "-"}</dd>
          <dt>ผู้บังคับบัญชา</dt>
          <dd>{e.supervisor_id ? <Link href={`/employees/${e.supervisor_id}`}>{e.sup_first} {e.sup_last}</Link> : "-"}</dd>
          <dt>วันเกิด</dt>
          <dd>{e.bd ? `${fd(e.bd)} (${age(e.bd)} ปี)` : "-"}</dd>
          <dt>ทีม</dt>
          <dd>{team[0].n} คน</dd>
          <dt>ติดต่อ</dt>
          <dd>
            {e.work_email || "-"} · {e.work_phone || e.mobile || "-"}
          </dd>
        </dl>
      </div>
      <div className="card">
        <h2>การเข้างาน 30 วันล่าสุด</h2>
        <div className="kpi">
          <div>
            <b>{score}</b>
            <span>คะแนนการเข้างาน</span>
          </div>
          <div>
            <b>{s.absent_days}</b>
            <span>ขาดงาน</span>
          </div>
          <div>
            <b>{s.late_count}</b>
            <span>สาย</span>
          </div>
          <div>
            <b>{s.early_count}</b>
            <span>กลับก่อน</span>
          </div>
          <div>
            <b>{s.leave_days}</b>
            <span>ลา (วัน)</span>
          </div>
        </div>
      </div>
      <div className="card">
        <h2>Journey</h2>
        {journey.length === 0 ? <div className="empty">ยังไม่มี Journey</div> : null}
        <table className="tbl compact">
          <tbody>
            {journey.map((j: any, i: number) => (
              <tr key={i}>
                <td>{fd(j.d)}</td>
                <td>
                  {j.k === "history"
                    ? `${j.title}${showMoney && j.amount ? ` → ${money(j.amount)}` : ""}`
                    : j.k === "action"
                      ? ACTION_KINDS[j.kind] || j.kind
                      : `${DOC_TYPES[j.title]} (${REQ_STATUS[j.kind]})`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hr && (
        <div className="row noprint">
          <Link className="btn" href={`/team/actions?kind=salary_adjust`}>
            สร้างการดำเนินการ
          </Link>
          <Link className="btn" href={`/documents/new?type=leave&for=${e.id}`}>
            สร้างเอกสารแทน
          </Link>
          <form action={deleteEmployee}>
            <input type="hidden" name="id" value={e.id} />
            <ConfirmButton message={`ลบ ${fullName(e)} ออกจากระบบถาวร? (แนะนำให้ใช้การพ้นสภาพแทน)`}>ลบพนักงาน</ConfirmButton>
          </form>
        </div>
      )}
    </>
  );
}
