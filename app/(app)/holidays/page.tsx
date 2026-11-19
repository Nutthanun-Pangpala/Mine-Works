import { isHR, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { addHoliday, deleteHoliday } from "@/app/actions";
import Notice from "@/components/Notice";

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const hr = isHR(u);
  const rows = await sql()`
    select id, to_char(holiday_date, 'DD/MM/YYYY') as day, name
    from holidays
    where holiday_date >= date_trunc('year', (now() at time zone 'Asia/Bangkok'))::date
    order by holiday_date`;

  return (
    <>
      <div className="head">
        <div>
          <h1>วันหยุดบริษัท</h1>
          <div className="muted">ตั้งแต่ต้นปีนี้เป็นต้นไป</div>
        </div>
      </div>
      <Notice sp={sp} />
      {hr && (
        <section className="card">
          <h2>เพิ่มวันหยุด</h2>
          <form action={addHoliday} className="inline">
            <input type="date" name="holiday_date" required />
            <input name="name" required placeholder="ชื่อวันหยุด" />
            <button className="btn primary" type="submit">
              เพิ่ม
            </button>
          </form>
        </section>
      )}
      <section className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>วันที่</th>
              <th>วันหยุด</th>
              {hr && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((h: any) => (
              <tr key={h.id}>
                <td>{h.day}</td>
                <td>{h.name}</td>
                {hr && (
                  <td>
                    <form action={deleteHoliday}>
                      <input type="hidden" name="id" value={h.id} />
                      <button className="btn sm danger" type="submit">
                        ลบ
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">ยังไม่ได้กำหนดวันหยุด</div>}
      </section>
    </>
  );
}
