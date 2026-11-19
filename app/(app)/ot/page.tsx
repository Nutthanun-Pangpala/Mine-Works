import { isHR, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { STATUS_LABEL, todayBkk } from "@/lib/util";
import { cancelOT, decideOT, requestOT } from "@/app/actions";
import Notice from "@/components/Notice";

export default async function OTPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const hr = isHR(u);
  const admin = u.role === "admin";

  const [mine, pending] = await Promise.all([
    sql()`
      select id, to_char(work_date, 'DD/MM/YYYY') as day, hours::float as hours, reason, status
      from ot_requests where employee_id = ${u.id}
      order by created_at desc limit 50`,
    sql()`
      select o.id, emp.code, emp.first_name || ' ' || emp.last_name as name,
             to_char(o.work_date, 'DD/MM/YYYY') as day, o.hours::float as hours, o.reason
      from ot_requests o join employees emp on emp.id = o.employee_id
      where o.status = 'pending'
        and ((o.employee_id <> ${u.id} and (${hr}::boolean or emp.manager_id = ${u.id}))
             or (o.employee_id = ${u.id} and ${admin}::boolean))
      order by o.created_at`,
  ]);

  return (
    <>
      <div className="head">
        <h1>ล่วงเวลา (OT)</h1>
      </div>
      <Notice sp={sp} />

      {pending.length > 0 && (
        <section className="card">
          <h2>รออนุมัติ</h2>
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>พนักงาน</th>
                  <th>วันที่</th>
                  <th>ชั่วโมง</th>
                  <th>เหตุผล</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      {r.code} {r.name}
                    </td>
                    <td>{r.day}</td>
                    <td>{r.hours}</td>
                    <td className="wrap">{r.reason || "–"}</td>
                    <td>
                      <form action={decideOT} className="actions">
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn sm primary" name="decision" value="approve" type="submit">
                          อนุมัติ
                        </button>
                        <button className="btn sm danger" name="decision" value="reject" type="submit">
                          ไม่อนุมัติ
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2>ขอทำ OT</h2>
        <form action={requestOT} className="fields">
          <label>
            วันที่
            <input type="date" name="work_date" required defaultValue={todayBkk()} />
          </label>
          <label>
            จำนวนชั่วโมง
            <input type="number" name="hours" min="0.5" max="24" step="0.5" required />
          </label>
          <label className="full">
            เหตุผล / งานที่ทำ
            <input name="reason" maxLength={300} />
          </label>
          <div className="full">
            <button className="btn primary" type="submit">
              ส่งคำขอ
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>คำขอ OT ของฉัน</h2>
        <div className="scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>ชั่วโมง</th>
                <th>เหตุผล</th>
                <th>สถานะ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {mine.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.day}</td>
                  <td>{r.hours}</td>
                  <td className="wrap">{r.reason || "–"}</td>
                  <td>
                    <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td>
                    {r.status === "pending" && (
                      <form action={cancelOT}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn sm" type="submit">
                          ยกเลิก
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mine.length === 0 && <div className="empty">ยังไม่มีคำขอ</div>}
      </section>
    </>
  );
}
