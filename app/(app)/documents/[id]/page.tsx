import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser, subordinateIds } from "@/lib/auth";
import { sql } from "@/lib/db";
import { canDecide } from "@/lib/workflow";
import { cancelDocument, decideDocument } from "@/app/actions/documents";
import { ACTION_KINDS, CERT_DOCS, DOC_TYPES, REQ_STATUS, WARNING_LEVELS, fd, fdt, fullName, minutesText, money, num } from "@/lib/util";
import Notice from "@/components/Notice";
import Badge from "@/components/Badge";
import ConfirmButton from "@/components/ConfirmButton";

export default async function DocumentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await requireUser();
  const r = (
    await sql()`
      select r.*, r.start_date::text as sd, r.end_date::text as ed, e.code, e.first_name, e.last_name,
             lt.name as sub, wt.name as wname, mo.name as reason, c.first_name as cf, c.last_name as cl,
             f.name as file_name
      from requests r join employees e on e.id = r.employee_id
      left join leave_types lt on lt.id = r.sub_type_id and r.doc_type in ('leave','offsite','certify','swap','accumulate')
      left join welfare_types wt on wt.id = r.sub_type_id and r.doc_type = 'welfare'
      left join master_options mo on mo.id = r.reason_id
      left join employees c on c.id = r.created_by
      left join files f on f.id = r.file_id
      where r.id = ${Number(id)}`
  )[0];
  if (!r) notFound();

  const steps = await sql()`
    select s.*, a.first_name, a.last_name, ro.name as role_name, d.first_name as df, d.last_name as dl
    from request_steps s left join employees a on a.id = s.approver_id left join roles ro on ro.id = s.role_id
    left join employees d on d.id = s.decided_by
    where s.request_id = ${r.id} order by s.seq`;
  const step = await canDecide(u.id, u.roles.map((x) => x.id), r.id);
  const isOwner = r.employee_id === u.id || r.created_by === u.id;
  const isApprover = steps.some((s: any) => s.approver_id === u.id || u.roles.some((x) => x.id === s.role_id));
  const viewer = isOwner || isApprover || can(u, "documents.onbehalf") || (u.isSupervisor && (await subordinateIds(u.id)).includes(r.employee_id));
  if (!viewer) notFound();
  const p = r.payload || {};
  const canCancel = (isOwner && r.status === "pending") || (can(u, "documents.onbehalf", "edit") && ["pending", "approved"].includes(r.status));

  return (
    <>
      <div className="head">
        <div>
          <h1>
            {DOC_TYPES[r.doc_type]} #{r.id}
          </h1>
          <div className="muted">
            <Link href="/documents">เอกสารของฉัน</Link>
          </div>
        </div>
        <Badge status={r.status} label={REQ_STATUS[r.status]} />
      </div>
      <Notice sp={sp} />
      <div className="cols">
        <div className="card">
          <dl className="info">
            <dt>พนักงาน</dt>
            <dd>
              {r.code} {fullName(r)}
            </dd>
            {(r.sub || r.wname) && (
              <>
                <dt>ประเภท</dt>
                <dd>{r.sub || r.wname}</dd>
              </>
            )}
            {r.doc_type === "action" && (
              <>
                <dt>การดำเนินการ</dt>
                <dd>{ACTION_KINDS[p.kind] || p.kind}</dd>
              </>
            )}
            {r.sd && (
              <>
                <dt>{r.doc_type === "action" ? "วันที่มีผล" : "วันที่"}</dt>
                <dd>
                  {fd(r.sd)}
                  {r.ed && r.ed !== r.sd ? ` – ${fd(r.ed)}` : ""}
                  {r.start_time ? ` เวลา ${String(r.start_time).slice(0, 5)}–${String(r.end_time || "").slice(0, 5)}` : ""}
                </dd>
              </>
            )}
            {(Number(r.days) > 0 || r.minutes > 0) && (
              <>
                <dt>ระยะเวลา</dt>
                <dd>{r.full_day && Number(r.days) ? `${num(r.days, 2)} วัน` : minutesText(r.minutes)}</dd>
              </>
            )}
            {r.doc_type === "ot" && (
              <>
                <dt>ประเภท OT</dt>
                <dd>{String(p.ot_kind || "").toUpperCase()}</dd>
              </>
            )}
            {r.doc_type === "certify" && (
              <>
                <dt>เวลาที่รับรอง</dt>
                <dd>
                  เข้า {p.in_time || "-"} / ออก {p.out_time || "-"} {p.out_next_day ? "(วันถัดไป)" : ""}
                </dd>
              </>
            )}
            {r.doc_type === "doc" && (
              <>
                <dt>เอกสาร</dt>
                <dd>
                  {CERT_DOCS[p.cert] || p.cert} × {p.copies || 1} ({p.lang === "en" ? "อังกฤษ" : "ไทย"})
                </dd>
              </>
            )}
            {r.doc_type === "warning" && (
              <>
                <dt>ระดับ</dt>
                <dd>{WARNING_LEVELS[p.level] || p.level}</dd>
              </>
            )}
            {r.amount && (
              <>
                <dt>จำนวนเงิน</dt>
                <dd>{money(r.amount)} บาท</dd>
              </>
            )}
            {r.reason && (
              <>
                <dt>เหตุผล</dt>
                <dd>{r.reason}</dd>
              </>
            )}
            {p.salary_after && (
              <>
                <dt>เงินเดือนใหม่</dt>
                <dd>{money(p.salary_after)}</dd>
              </>
            )}
            <dt>รายละเอียด</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{r.detail || "-"}</dd>
            {r.file_id && (
              <>
                <dt>ไฟล์แนบ</dt>
                <dd>
                  <a href={`/api/files/${r.file_id}`} target="_blank">
                    {r.file_name}
                  </a>
                </dd>
              </>
            )}
            <dt>สร้างโดย</dt>
            <dd>
              {r.cf} {r.cl} · {fdt(r.created_at)}
            </dd>
          </dl>
          <div className="row" style={{ marginTop: 14 }}>
            {r.doc_type === "doc" && r.status === "approved" && (
              <Link className="btn" href={`/print/certificate/${r.id}`} target="_blank">
                พิมพ์เอกสาร
              </Link>
            )}
            {r.doc_type === "warning" && r.status === "approved" && (
              <Link className="btn" href={`/print/warning/${r.id}`} target="_blank">
                พิมพ์หนังสือเตือน
              </Link>
            )}
            {canCancel && (
              <form action={cancelDocument}>
                <input type="hidden" name="id" value={r.id} />
                <ConfirmButton message="ยืนยันการยกเลิกเอกสารนี้?" className="btn danger">
                  ยกเลิกเอกสาร
                </ConfirmButton>
              </form>
            )}
          </div>
        </div>

        <div className="card">
          <h2>ลำดับการอนุมัติ</h2>
          {steps.length === 0 ? <div className="empty">ไม่ต้องอนุมัติ</div> : null}
          <table className="tbl compact">
            <tbody>
              {steps.map((s: any) => (
                <tr key={s.id}>
                  <td>{s.seq}</td>
                  <td>{s.approver_id ? `${s.first_name} ${s.last_name}` : `บทบาท ${s.role_name}`}</td>
                  <td>
                    <Badge
                      status={s.status === "waiting" ? "" : s.status}
                      label={{ waiting: "รอลำดับก่อนหน้า", pending: "รออนุมัติ", approved: "อนุมัติ", rejected: "ไม่อนุมัติ", skipped: "ข้าม" }[s.status as string]}
                    />
                  </td>
                  <td className="small">
                    {s.decided_at ? `${s.df ?? ""} ${fdt(s.decided_at)}` : ""}
                    {s.comment ? <div>“{s.comment}”</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {step && (
            <form action={decideDocument} className="fields" style={{ marginTop: 14 }}>
              <input type="hidden" name="id" value={r.id} />
              <label className="full">
                ความคิดเห็น
                <input name="comment" />
              </label>
              <div className="row full">
                <button className="btn primary" name="decision" value="approve">
                  อนุมัติ
                </button>
                <button className="btn danger" name="decision" value="reject">
                  ไม่อนุมัติ
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
