import { notFound, redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Letterhead, Sign, companyFor, signerFor } from "@/lib/print";
import { WARNING_LEVELS, fdLong, fullName } from "@/lib/util";

export default async function WarningLetter({ params }: { params: Promise<{ reqId: string }> }) {
  const { reqId } = await params;
  const u = await requireUser();
  const r = (
    await sql()`
      select r.*, r.start_date::text as d, mo.name as reason from requests r left join master_options mo on mo.id = r.reason_id
      where r.id = ${Number(reqId)} and r.doc_type = 'warning'`
  )[0];
  if (!r) notFound();
  const involved = (await sql()`select 1 from request_steps where request_id = ${r.id} and approver_id = ${u.id}`).length > 0;
  if (!(r.employee_id === u.id || r.created_by === u.id || can(u, "employees") || involved)) redirect("/?error=forbidden");
  if (r.status !== "approved") redirect(`/documents/${r.id}?error=state`);
  const e = (
    await sql()`select e.*, p.name as position, ou.name as unit from employees e left join positions p on p.id = e.position_id
                left join org_units ou on ou.id = e.org_unit_id where e.id = ${r.employee_id}`
  )[0];
  const c = await companyFor(e.company_id);
  const signer = await signerFor(c, "warning");
  const prior = await sql()`
    select start_date::text as d, payload->>'level' as level from requests
    where employee_id = ${e.id} and doc_type = 'warning' and status = 'approved' and id <> ${r.id} and start_date <= ${r.d}
    order by start_date`;
  return (
    <div className="paper cert">
      <Letterhead c={c} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <span>ที่ WL {String(r.id).padStart(5, "0")}</span>
        <span>วันที่ {fdLong(r.d)}</span>
      </div>
      <h2 style={{ textAlign: "center", margin: "24px 0 8px" }}>หนังสือเตือน</h2>
      <div style={{ textAlign: "center", marginBottom: 20 }}>{WARNING_LEVELS[r.payload?.level] || ""}</div>
      <p>
        <b>เรื่อง</b> {r.reason || "การกระทำผิดระเบียบข้อบังคับเกี่ยวกับการทำงาน"}
      </p>
      <p>
        <b>เรียน</b> {fullName(e)} รหัสพนักงาน {e.code} ตำแหน่ง {e.position || "-"} {e.unit ? `สังกัด ${e.unit}` : ""}
      </p>
      <p className="indent" style={{ whiteSpace: "pre-wrap" }}>
        {r.detail}
      </p>
      {prior.length > 0 && (
        <p className="indent">
          ทั้งนี้ ท่านเคยได้รับการตักเตือนมาแล้ว {prior.length} ครั้ง ({prior.map((p: any) => `${WARNING_LEVELS[p.level] || ""} ${fdLong(p.d)}`).join(", ")})
        </p>
      )}
      <p className="indent">
        บริษัทจึงขอตักเตือนเป็นลายลักษณ์อักษรมา ณ ที่นี้ และหากท่านกระทำผิดซ้ำในเรื่องเดียวกันหรือกระทำผิดในเรื่องอื่นอีก บริษัทจะพิจารณาลงโทษตามระเบียบข้อบังคับเกี่ยวกับการทำงานต่อไป
      </p>
      <div className="sign-row">
        <Sign s={signer} label="ผู้มีอำนาจลงนาม" />
        <Sign s={e} label="ผู้รับหนังสือเตือน (ลงชื่อรับทราบ)" />
      </div>
      <div className="sign-row">
        <Sign s={null} label="พยาน" />
        <Sign s={null} label="พยาน" />
      </div>
    </div>
  );
}
