import { isHR, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { STATUS_LABEL, todayBkk } from "@/lib/util";
import { cancelLeave, decideLeave, requestLeave } from "@/app/actions";
import Notice from "@/components/Notice";

export default async function LeavePage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const hr = isHR(u);
  const admin = u.role === "admin";
  const today = todayBkk();

  const [types, mine, pending] = await Promise.all([
    sql()`
      select lt.id, lt.name, lt.days_per_year::float as quota,
        coalesce((select sum(lr.days) from leave_requests lr
          where lr.leave_type_id = lt.id and lr.employee_id = ${u.id} and lr.status in ('approved','pending')
            and extract(year from lr.start_date) = extract(year from ${today}::date)), 0)::float as used
      from leave_types lt order by lt.id`,
    sql()`
      select lr.id, lt.name as type, to_char(lr.start_date, 'DD/MM/YYYY') as s, to_char(lr.end_date, 'DD/MM/YYYY') as e,
             lr.days::float as days, lr.reason, lr.status
      from leave_requests lr join leave_types lt on lt.id = lr.leave_type_id
      where lr.employee_id = ${u.id}
      order by lr.created_at desc limit 50`,
    sql()`
      select lr.id, emp.code, emp.first_name || ' ' || emp.last_name as name, lt.name as type,
             to_char(lr.start_date, 'DD/MM/YYYY') as s, to_char(lr.end_date, 'DD/MM/YYYY') as e,
             lr.days::float as days, lr.reason
      from leave_requests lr
      join employees emp on emp.id = lr.employee_id
      join leave_types lt on lt.id = lr.leave_type_id
      where lr.status = 'pending'
        and ((lr.employee_id <> ${u.id} and (${hr}::boolean or emp.manager_id = ${u.id}))
             or (lr.employee_id = ${u.id} and ${admin}::boolean))
      order by lr.created_at`,
  ]);

  const history = hr
    ? await sql()`
        select lr.id, emp.code, emp.first_name || ' ' || emp.last_name as name, lt.name as type,
               to_char(lr.start_date, 'DD/MM/YYYY') as s, to_char(lr.end_date, 'DD/MM/YYYY') as e,
               lr.days::float as days, lr.status
        from leave_requests lr
        join employees emp on emp.id = lr.employee_id
        join leave_types lt on lt.id = lr.leave_type_id
        where lr.status <> 'pending'
        order by lr.created_at desc limit 50`
    : [];

  return (
    <>
      <div className="head">
        <h1>การลา</h1>
      </div>
      <Notice sp={sp} />

      <div className="grid">
        {types.map((t: any) => (
          <div className="stat" key={t.id}>
            <b>{t.quota - t.used}</b>
            <span>
              {t.name} คงเหลือ (จาก {t.quota} วัน)
            </span>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <section className="card">
          <h2>รออนุมัติ</h2>
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>พนักงาน</th>
                  <th>ประเภท</th>
                  <th>ช่วงวันที่</th>
                  <th>วัน</th>
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
                    <td>{r.type}</td>
                    <td>
                      {r.s} – {r.e}
                    </td>
                    <td>{r.days}</td>
                    <td className="wrap">{r.reason || "–"}</td>
                    <td>
                      <form action={decideLeave} className="actions">
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
        <h2>ขอลา</h2>
        <form action={requestLeave} className="fields">
          <label>
            ประเภทการลา
            <select name="leave_type_id" required>
              {types.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            ตั้งแต่วันที่
            <input type="date" name="start_date" required />
          </label>
          <label>
            ถึงวันที่
            <input type="date" name="end_date" required />
          </label>
          <label className="full">
            เหตุผล
            <input name="reason" maxLength={300} />
          </label>
          <div className="full">
            <button className="btn primary" type="submit">
              ส่งใบลา
            </button>
            <span className="muted small"> ระบบนับเฉพาะวันจันทร์–ศุกร์ และไม่นับวันหยุดบริษัท</span>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>ใบลาของฉัน</h2>
        <div className="scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>ประเภท</th>
                <th>ช่วงวันที่</th>
                <th>วัน</th>
                <th>เหตุผล</th>
                <th>สถานะ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {mine.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.type}</td>
                  <td>
                    {r.s} – {r.e}
                  </td>
                  <td>{r.days}</td>
                  <td className="wrap">{r.reason || "–"}</td>
                  <td>
                    <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td>
                    {r.status === "pending" && (
                      <form action={cancelLeave}>
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
        {mine.length === 0 && <div className="empty">ยังไม่มีใบลา</div>}
      </section>

      {hr && (
        <section className="card">
          <h2>ประวัติใบลาทั้งองค์กร (50 รายการล่าสุด)</h2>
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>พนักงาน</th>
                  <th>ประเภท</th>
                  <th>ช่วงวันที่</th>
                  <th>วัน</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      {r.code} {r.name}
                    </td>
                    <td>{r.type}</td>
                    <td>
                      {r.s} – {r.e}
                    </td>
                    <td>{r.days}</td>
                    <td>
                      <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {history.length === 0 && <div className="empty">ยังไม่มีรายการ</div>}
        </section>
      )}
    </>
  );
}
