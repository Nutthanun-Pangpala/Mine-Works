import Link from "next/link";
import { requireUser, teamScope } from "@/lib/auth";
import { sql } from "@/lib/db";
import { DOC_TYPES, REQ_STATUS, fd, fullName, isDate, minutesText, money, num, todayBkk, addDays } from "@/lib/util";
import Badge from "@/components/Badge";

export default async function TeamDocuments({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const scope = await teamScope(u);
  const ids = scope === "all" ? null : scope;
  const from = isDate(sp.from) ? sp.from : addDays(todayBkk(), -30);
  const to = isDate(sp.to) ? sp.to : addDays(todayBkk(), 60);
  const type = DOC_TYPES[sp.type] ? sp.type : "";
  const status = REQ_STATUS[sp.status] ? sp.status : "";
  const rows =
    ids && ids.length === 0
      ? []
      : await sql().query(
          `select r.*, r.start_date::text as sd, r.end_date::text as ed, e.code, e.first_name, e.last_name, lt.name as sub
           from requests r join employees e on e.id = r.employee_id
           left join leave_types lt on lt.id = r.sub_type_id and r.doc_type in ('leave','offsite','certify','swap','accumulate')
           where ($1::int[] is null or r.employee_id = any($1::int[]))
             and coalesce(r.start_date, r.created_at::date) between $2 and $3
             and ($4 = '' or r.doc_type = $4) and ($5 = '' or r.status = $5)
           order by coalesce(r.start_date, r.created_at::date) desc, r.id desc limit 300`,
          [ids, from, to, type, status],
        );
  return (
    <>
      <form className="inline" style={{ marginBottom: 12 }}>
        <label>
          ตั้งแต่
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          ถึง
          <input type="date" name="to" defaultValue={to} />
        </label>
        <label>
          ประเภท
          <select name="type" defaultValue={type}>
            <option value="">ทั้งหมด</option>
            {Object.entries(DOC_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          สถานะ
          <select name="status" defaultValue={status}>
            <option value="">ทั้งหมด</option>
            {Object.entries(REQ_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button className="btn">กรอง</button>
        <span className="spacer" />
        <Link className="btn primary" href="/documents/new?type=leave">
          + สร้างเอกสารแทนพนักงาน
        </Link>
      </form>
      <div className="card scroll">
        {rows.length === 0 ? <div className="empty">ไม่มีข้อมูล</div> : null}
        <table className="tbl">
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/documents/${r.id}`}>#{r.id}</Link>
                </td>
                <td>
                  {fullName(r)}
                  <div className="small muted">{r.code}</div>
                </td>
                <td>
                  {DOC_TYPES[r.doc_type]}
                  {r.sub ? <div className="small muted">{r.sub}</div> : null}
                </td>
                <td>
                  {r.sd ? fd(r.sd) : "-"}
                  {r.ed && r.ed !== r.sd ? ` – ${fd(r.ed)}` : ""}
                </td>
                <td>{r.amount ? `${money(r.amount)} บาท` : r.full_day && Number(r.days) ? `${num(r.days, 2)} วัน` : r.minutes ? minutesText(r.minutes) : ""}</td>
                <td className="wrap">{r.detail}</td>
                <td>
                  <Badge status={r.status} label={REQ_STATUS[r.status]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
