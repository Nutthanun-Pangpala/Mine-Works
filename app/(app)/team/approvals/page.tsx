import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decideDocument, decideMany } from "@/app/actions/documents";
import { ACTION_KINDS, DOC_TYPES, REQ_STATUS, fd, fdt, fullName, minutesText, money, num } from "@/lib/util";
import Notice from "@/components/Notice";
import Badge from "@/components/Badge";

export default async function Approvals({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const roleIds = u.roles.map((r) => r.id);
  const [pending, history] = await Promise.all([
    sql()`
      select distinct on (r.id) r.*, r.start_date::text as sd, r.end_date::text as ed, e.code, e.first_name, e.last_name,
             lt.name as sub, wt.name as wname, s.seq, (select count(*) from request_steps x where x.request_id = r.id)::int as total
      from request_steps s join requests r on r.id = s.request_id join employees e on e.id = r.employee_id
      left join leave_types lt on lt.id = r.sub_type_id and r.doc_type in ('leave','offsite','certify','swap','accumulate')
      left join welfare_types wt on wt.id = r.sub_type_id and r.doc_type = 'welfare'
      where s.status = 'pending' and r.status = 'pending' and (s.approver_id = ${u.id} or s.role_id = any(${roleIds}::int[]))
      order by r.id, s.seq`,
    sql()`
      select r.id, r.doc_type, r.status, r.start_date::text as sd, e.first_name, e.last_name, s.status as my, s.decided_at, lt.name as sub
      from request_steps s join requests r on r.id = s.request_id join employees e on e.id = r.employee_id
      left join leave_types lt on lt.id = r.sub_type_id and r.doc_type in ('leave','offsite','certify','swap','accumulate')
      where s.decided_by = ${u.id} order by s.decided_at desc limit 30`,
  ]);
  const summary = (r: any) => {
    if (r.doc_type === "action") return ACTION_KINDS[r.payload?.kind] || "";
    if (r.amount) return `${money(r.amount)} บาท`;
    if (r.full_day && Number(r.days)) return `${num(r.days, 2)} วัน`;
    if (r.minutes) return minutesText(r.minutes);
    return "";
  };
  return (
    <>
      <Notice sp={sp} />
      <div className="card scroll">
        <h2>รออนุมัติ ({pending.length})</h2>
        {pending.length === 0 ? <div className="empty">ไม่มีเอกสารรออนุมัติ</div> : null}
        {pending.length > 0 && (
          <form action={decideMany}>
            <table className="tbl">
              <thead>
                <tr>
                  <th></th>
                  <th>พนักงาน</th>
                  <th>เอกสาร</th>
                  <th>วันที่</th>
                  <th>จำนวน</th>
                  <th>รายละเอียด</th>
                  <th>ขั้น</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <input type="checkbox" name="ids" value={r.id} />
                    </td>
                    <td>
                      {fullName(r)}
                      <div className="small muted">{r.code}</div>
                    </td>
                    <td>
                      <Link href={`/documents/${r.id}`}>
                        {DOC_TYPES[r.doc_type]} #{r.id}
                      </Link>
                      {r.sub || r.wname ? <div className="small muted">{r.sub || r.wname}</div> : null}
                    </td>
                    <td>
                      {r.sd ? fd(r.sd) : "-"}
                      {r.ed && r.ed !== r.sd ? ` – ${fd(r.ed)}` : ""}
                    </td>
                    <td>{summary(r)}</td>
                    <td className="wrap">{r.detail}</td>
                    <td>
                      {r.seq}/{r.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" name="decision" value="approve">
                อนุมัติที่เลือก
              </button>
              <button className="btn danger" name="decision" value="reject">
                ไม่อนุมัติที่เลือก
              </button>
            </div>
          </form>
        )}
      </div>
      <div className="card scroll">
        <h2>ประวัติการอนุมัติของฉัน</h2>
        {history.length === 0 ? <div className="empty">ยังไม่มี</div> : null}
        <table className="tbl compact">
          <tbody>
            {history.map((h: any, i: number) => (
              <tr key={i}>
                <td>
                  <Link href={`/documents/${h.id}`}>#{h.id}</Link>
                </td>
                <td>{fullName(h)}</td>
                <td>{h.sub || DOC_TYPES[h.doc_type]}</td>
                <td>{h.sd ? fd(h.sd) : ""}</td>
                <td>{h.my === "approved" ? "อนุมัติ" : "ไม่อนุมัติ"}</td>
                <td>
                  <Badge status={h.status} label={REQ_STATUS[h.status]} />
                </td>
                <td className="small muted">{fdt(h.decided_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* keep import used for single decisions on the detail page */}
      <form action={decideDocument} hidden />
    </>
  );
}
