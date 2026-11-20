import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { DOC_TYPES, REQ_STATUS, SELF_TYPES, fd, minutesText, num } from "@/lib/util";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";
import Badge from "@/components/Badge";


export default async function DocumentsPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const type = SELF_TYPES.concat(["warning"]).includes(sp.type) ? sp.type : "";
  const status = ["pending", "approved", "rejected", "cancelled"].includes(sp.status) ? sp.status : "";
  const qtext = String(sp.q || "").trim();

  const [rows, counts] = await Promise.all([
    sql()`
      select r.*, r.start_date::text as sd, r.end_date::text as ed, lt.name as sub, wt.name as wname,
             c.first_name as by_first, c.last_name as by_last
      from requests r
      left join leave_types lt on lt.id = r.sub_type_id and r.doc_type in ('leave','offsite','certify','swap','accumulate')
      left join welfare_types wt on wt.id = r.sub_type_id and r.doc_type = 'welfare'
      left join employees c on c.id = r.created_by
      where r.employee_id = ${u.id}
        and (${type} = '' or r.doc_type = ${type})
        and (${status} = '' or r.status = ${status})
        and (${qtext} = '' or coalesce(r.detail,'') ilike ${"%" + qtext + "%"} or coalesce(lt.name,'') ilike ${"%" + qtext + "%"})
      order by r.created_at desc limit 200`,
    sql()`select doc_type, count(*)::int as n from requests where employee_id = ${u.id} and status = 'pending' group by doc_type`,
  ]);
  const cnt = (t: string) => counts.find((c: any) => c.doc_type === t)?.n || 0;

  return (
    <>
      <div className="head">
        <h1>เอกสารของฉัน</h1>
        <details className="box" style={{ margin: 0 }}>
          <summary className="btn primary">+ สร้างเอกสาร</summary>
          <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
            {SELF_TYPES.map((t) => (
              <Link key={t} href={`/documents/new?type=${t}`}>
                {DOC_TYPES[t]}
              </Link>
            ))}
          </div>
        </details>
      </div>
      <Notice sp={sp} />
      <Tabs
        tabs={[{ href: "/documents", label: "ทั้งหมด", on: !type }].concat(
          SELF_TYPES.concat(["warning"]).map((t) => ({ href: `/documents?type=${t}`, label: DOC_TYPES[t], on: type === t, count: cnt(t) })) as any,
        )}
        small
      />
      <form className="inline" style={{ marginBottom: 12 }}>
        {type && <input type="hidden" name="type" value={type} />}
        <input name="q" placeholder="ค้นหาเอกสาร" defaultValue={qtext} />
        <select name="status" defaultValue={status}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(REQ_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="btn">กรอง</button>
      </form>
      <div className="card scroll">
        {rows.length === 0 ? <div className="empty">ไม่มีข้อมูล</div> : null}
        <table className="tbl">
          {rows.length > 0 && (
            <thead>
              <tr>
                <th>เลขที่</th>
                <th>ประเภท</th>
                <th>วันที่</th>
                <th>ระยะเวลา / จำนวน</th>
                <th>รายละเอียด</th>
                <th>สถานะ</th>
                <th>สร้างโดย</th>
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/documents/${r.id}`}>#{r.id}</Link>
                </td>
                <td>
                  {DOC_TYPES[r.doc_type]}
                  {r.sub || r.wname ? <div className="small muted">{r.sub || r.wname}</div> : null}
                </td>
                <td>
                  {r.sd ? fd(r.sd) : "-"}
                  {r.ed && r.ed !== r.sd ? ` – ${fd(r.ed)}` : ""}
                  {r.start_time ? <div className="small muted">{String(r.start_time).slice(0, 5)}–{String(r.end_time || "").slice(0, 5)}</div> : null}
                </td>
                <td>{r.amount ? `${num(r.amount, 2)} บาท` : r.full_day && Number(r.days) ? `${num(r.days, 2)} วัน` : r.minutes ? minutesText(r.minutes) : "-"}</td>
                <td className="wrap">{r.detail}</td>
                <td>
                  <Badge status={r.status} label={REQ_STATUS[r.status]} />
                </td>
                <td className="small">{r.created_by === u.id ? "ตนเอง" : `${r.by_first ?? ""} ${r.by_last ?? ""}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
