import Link from "next/link";
import { sql } from "@/lib/db";
import { loadProfile } from "@/lib/profile";
import { options } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { addAttachment, deleteAttachment } from "@/app/actions/employees";
import { REQ_STATUS, WARNING_LEVELS, fd, fdt, todayBkk } from "@/lib/util";
import Notice from "@/components/Notice";
import Badge from "@/components/Badge";
import ConfirmButton from "@/components/ConfirmButton";

export default async function Docs({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { e, canEdit, hr } = await loadProfile(id);
  const [types, files, warnings] = await Promise.all([
    options("attachment_type"),
    sql()`
      select a.*, a.expires_on::text as exp, f.name as fname, f.size, u.first_name as uf
      from employee_attachments a left join files f on f.id = a.file_id left join employees u on u.id = a.uploaded_by
      where a.employee_id = ${e.id} order by a.created_at desc`,
    sql()`
      select r.id, r.start_date::text as sd, r.status, r.payload, r.detail, mo.name as rule
      from requests r left join master_options mo on mo.id = r.reason_id
      where r.employee_id = ${e.id} and r.doc_type = 'warning' order by r.start_date desc`,
  ]);
  const today = todayBkk();
  return (
    <>
      <Notice sp={sp} />
      <div className="card">
        <h2>ไฟล์แนบ</h2>
        <table className="tbl compact">
          <thead>
            <tr>
              <th>เอกสาร</th>
              <th>ไฟล์</th>
              <th>วันหมดอายุ</th>
              <th>อัปโหลดโดย</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {types.map((t: any) => {
              const has = files.filter((f: any) => f.type_id === t.id);
              return (
                <tr key={"t" + t.id}>
                  <td className="wrap">
                    {t.name}
                    <div className="small muted">{t.description}</div>
                  </td>
                  <td>
                    {has.length === 0
                      ? "-"
                      : has.map((f: any) => (
                          <div key={f.id}>
                            <a href={`/api/files/${f.file_id}`} target="_blank">
                              {f.fname}
                            </a>
                          </div>
                        ))}
                  </td>
                  <td>{has.map((f: any) => <div key={f.id}>{f.exp ? <span className={f.exp < today ? "badge rejected" : ""}>{fd(f.exp)}</span> : "-"}</div>)}</td>
                  <td className="small">{has.map((f: any) => <div key={f.id}>{f.uf} {fdt(f.created_at)}</div>)}</td>
                  <td>
                    {canEdit &&
                      has.map((f: any) => (
                        <form key={f.id} action={deleteAttachment}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="rid" value={f.id} />
                          <ConfirmButton message="ลบไฟล์นี้?">ลบ</ConfirmButton>
                        </form>
                      ))}
                  </td>
                </tr>
              );
            })}
            {files
              .filter((f: any) => !f.type_id)
              .map((f: any) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td>
                    <a href={`/api/files/${f.file_id}`} target="_blank">
                      {f.fname}
                    </a>
                  </td>
                  <td>{f.exp ? fd(f.exp) : "-"}</td>
                  <td className="small">
                    {f.uf} {fdt(f.created_at)}
                  </td>
                  <td>
                    {canEdit && (
                      <form action={deleteAttachment}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="rid" value={f.id} />
                        <ConfirmButton message="ลบไฟล์นี้?">ลบ</ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {canEdit && (
          <form action={addAttachment} className="fields" style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={e.id} />
            <label>
              ประเภทเอกสาร
              <select name="type_id">
                <Opt list={types} empty="อื่นๆ" />
              </select>
            </label>
            <label>
              ชื่อเอกสาร (กรณีอื่นๆ)
              <input name="name" />
            </label>
            <label>
              วันหมดอายุ
              <input type="date" name="expires_on" />
            </label>
            <label>
              ไฟล์*
              <input type="file" name="file" required />
            </label>
            <button className="btn">อัปโหลด</button>
          </form>
        )}
      </div>
      <div className="card">
        <div className="row">
          <h2>หนังสือเตือน</h2>
          <span className="spacer" />
          {hr && (
            <Link className="btn sm" href={`/documents/new?type=warning&for=${e.id}`}>
              + ออกหนังสือเตือน
            </Link>
          )}
        </div>
        {warnings.length === 0 ? <div className="empty">ไม่มีข้อมูล</div> : null}
        <table className="tbl compact">
          <tbody>
            {warnings.map((w: any) => (
              <tr key={w.id}>
                <td>
                  <Link href={`/documents/${w.id}`}>#{w.id}</Link>
                </td>
                <td>{fd(w.sd)}</td>
                <td>{WARNING_LEVELS[w.payload?.level] || ""}</td>
                <td className="wrap">{w.rule || w.detail}</td>
                <td>
                  <Badge status={w.status} label={REQ_STATUS[w.status]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
