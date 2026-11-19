import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { enrollSelf, updateMyEnrollment } from "@/app/actions/learn";
import { fdBkk } from "@/lib/util";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";

const S: Record<string, string> = { assigned: "ยังไม่เริ่ม", in_progress: "กำลังเรียน", completed: "เรียนจบ" };

export default async function Learn({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const tab = sp.tab === "catalog" ? "catalog" : "mine";
  const [mine, catalog] = await Promise.all([
    sql()`select c.*, en.status, en.score, en.completed_at, mo.name as cat from course_enrollments en join courses c on c.id = en.course_id
          left join master_options mo on mo.id = c.category_id where en.employee_id = ${u.id} order by en.status = 'completed', c.title`,
    sql()`select c.*, mo.name as cat, exists (select 1 from course_enrollments x where x.course_id = c.id and x.employee_id = ${u.id}) as joined
          from courses c left join master_options mo on mo.id = c.category_id
          where c.published and (c.company_id is null or c.company_id = ${u.company_id}) order by mo.sort nulls last, c.title`,
  ]);
  const done = mine.filter((m: any) => m.status === "completed").length;
  return (
    <>
      <div className="head">
        <h1>เรียนรู้ (Learn)</h1>
        {can(u, "learn.manage") && (
          <Link className="btn" href="/learn/manage">
            จัดการหลักสูตร
          </Link>
        )}
      </div>
      <Notice sp={sp} />
      <Tabs
        tabs={[
          { href: "/learn", label: "หลักสูตรของฉัน", on: tab === "mine", count: mine.length - done },
          { href: "/learn?tab=catalog", label: "คลังหลักสูตร", on: tab === "catalog" },
        ]}
      />
      {tab === "mine" ? (
        <div className="card">
          <div className="kpi" style={{ marginBottom: 12 }}>
            <div><b>{mine.length}</b><span>หลักสูตรทั้งหมด</span></div>
            <div><b>{mine.filter((m: any) => m.status === "in_progress").length}</b><span>กำลังเรียน</span></div>
            <div><b>{done}</b><span>เรียนจบแล้ว</span></div>
          </div>
          {mine.length === 0 ? <div className="empty">ยังไม่มีหลักสูตร — เลือกจากคลังหลักสูตรได้</div> : null}
          <table className="tbl">
            <tbody>
              {mine.map((c: any) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.title}</b>
                    <div className="small muted">
                      {c.cat || ""} {c.duration_minutes ? `· ${c.duration_minutes} นาที` : ""}
                    </div>
                    {c.description ? <div className="small">{c.description}</div> : null}
                  </td>
                  <td>
                    {S[c.status]}
                    {c.completed_at ? <div className="small muted">{fdBkk(c.completed_at)}</div> : null}
                    {c.score != null ? <div className="small muted">คะแนน {c.score}</div> : null}
                  </td>
                  <td className="num">
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      {c.url && (
                        <a className="btn sm" href={c.url} target="_blank" rel="noreferrer">
                          เปิดบทเรียน
                        </a>
                      )}
                      {c.status !== "completed" && (
                        <form action={updateMyEnrollment}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="status" value={c.status === "assigned" ? "in_progress" : "completed"} />
                          <button className="btn sm primary">{c.status === "assigned" ? "เริ่มเรียน" : "เรียนจบแล้ว"}</button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          {catalog.length === 0 ? <div className="empty">ยังไม่มีหลักสูตรที่เผยแพร่</div> : null}
          <table className="tbl">
            <tbody>
              {catalog.map((c: any) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.title}</b>
                    <div className="small muted">
                      {c.cat || ""} {c.duration_minutes ? `· ${c.duration_minutes} นาที` : ""}
                    </div>
                    {c.description ? <div className="small">{c.description}</div> : null}
                  </td>
                  <td className="num">
                    {c.joined ? (
                      <span className="muted small">อยู่ในหลักสูตรของฉันแล้ว</span>
                    ) : (
                      <form action={enrollSelf}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="btn sm primary">ลงทะเบียนเรียน</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
