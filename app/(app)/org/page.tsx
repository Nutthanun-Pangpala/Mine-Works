import { redirect } from "next/navigation";
import { isHR, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { addOrgItem, deleteOrgItem } from "@/app/actions";
import Notice from "@/components/Notice";

function Del({ kind, id }: { kind: string; id: number }) {
  return (
    <form action={deleteOrgItem}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button className="btn sm danger" type="submit">
        ลบ
      </button>
    </form>
  );
}

export default async function OrgPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  if (!isHR(u)) redirect("/");

  const [branches, departments, positions, shifts, leaveTypes] = await Promise.all([
    sql()`select b.*, (select count(*) from employees e where e.branch_id = b.id and e.status = 'active')::int as n from branches b order by b.name`,
    sql()`select d.*, (select count(*) from employees e where e.department_id = d.id and e.status = 'active')::int as n from departments d order by d.name`,
    sql()`select p.*, (select count(*) from employees e where e.position_id = p.id and e.status = 'active')::int as n from positions p order by p.name`,
    sql()`select id, name, to_char(start_time, 'HH24:MI') as s, to_char(end_time, 'HH24:MI') as e, grace_min from shifts order by name`,
    sql()`select id, name, days_per_year::float as days from leave_types order by id`,
  ]);

  return (
    <>
      <div className="head">
        <div>
          <h1>โครงสร้างองค์กร</h1>
          <div className="muted">สาขา แผนก ตำแหน่ง กะ และประเภทการลา</div>
        </div>
      </div>
      <Notice sp={sp} />
      <div className="cols">
        <section className="card">
          <h2>สาขา</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>พิกัด / รัศมี</th>
                <th>พนักงาน</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {branches.map((b: any) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.lat != null ? `${b.lat}, ${b.lng} / ${b.radius_m ?? "–"} ม.` : "ไม่จำกัดพื้นที่"}</td>
                  <td>{b.n}</td>
                  <td>
                    <Del kind="branch" id={b.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={addOrgItem} className="fields" style={{ marginTop: 12 }}>
            <input type="hidden" name="kind" value="branch" />
            <label>
              ชื่อสาขา
              <input name="name" required />
            </label>
            <label>
              ละติจูด
              <input name="lat" type="number" step="any" />
            </label>
            <label>
              ลองจิจูด
              <input name="lng" type="number" step="any" />
            </label>
            <label>
              รัศมีลงเวลา (เมตร)
              <input name="radius_m" type="number" min="0" />
            </label>
            <div className="full">
              <button className="btn" type="submit">
                เพิ่มสาขา
              </button>
            </div>
          </form>
        </section>

        <section className="card">
          <h2>แผนก</h2>
          <table className="tbl">
            <tbody>
              {departments.map((d: any) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.n} คน</td>
                  <td>
                    <Del kind="department" id={d.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {departments.length === 0 && <div className="empty">ยังไม่มีแผนก</div>}
          <form action={addOrgItem} className="inline" style={{ marginTop: 12 }}>
            <input type="hidden" name="kind" value="department" />
            <input name="name" required placeholder="ชื่อแผนก" />
            <button className="btn" type="submit">
              เพิ่มแผนก
            </button>
          </form>
        </section>

        <section className="card">
          <h2>ตำแหน่ง</h2>
          <table className="tbl">
            <tbody>
              {positions.map((p: any) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.n} คน</td>
                  <td>
                    <Del kind="position" id={p.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {positions.length === 0 && <div className="empty">ยังไม่มีตำแหน่ง</div>}
          <form action={addOrgItem} className="inline" style={{ marginTop: 12 }}>
            <input type="hidden" name="kind" value="position" />
            <input name="name" required placeholder="ชื่อตำแหน่ง" />
            <button className="btn" type="submit">
              เพิ่มตำแหน่ง
            </button>
          </form>
        </section>

        <section className="card">
          <h2>กะการทำงาน</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>เวลา</th>
                <th>ผ่อนผันสาย</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shifts.map((s: any) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    {s.s}–{s.e}
                  </td>
                  <td>{s.grace_min} นาที</td>
                  <td>
                    <Del kind="shift" id={s.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={addOrgItem} className="fields" style={{ marginTop: 12 }}>
            <input type="hidden" name="kind" value="shift" />
            <label>
              ชื่อกะ
              <input name="name" required />
            </label>
            <label>
              เริ่ม
              <input name="start_time" type="time" required />
            </label>
            <label>
              เลิก
              <input name="end_time" type="time" required />
            </label>
            <label>
              ผ่อนผันสาย (นาที)
              <input name="grace_min" type="number" min="0" defaultValue={0} />
            </label>
            <div className="full">
              <button className="btn" type="submit">
                เพิ่มกะ
              </button>
            </div>
          </form>
        </section>

        <section className="card">
          <h2>ประเภทการลา</h2>
          <table className="tbl">
            <tbody>
              {leaveTypes.map((t: any) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.days} วัน/ปี</td>
                  <td>
                    <Del kind="leave_type" id={t.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={addOrgItem} className="inline" style={{ marginTop: 12 }}>
            <input type="hidden" name="kind" value="leave_type" />
            <input name="name" required placeholder="ชื่อประเภทการลา" />
            <input name="days_per_year" type="number" min="0" step="0.5" required placeholder="วัน/ปี" />
            <button className="btn" type="submit">
              เพิ่มประเภท
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
