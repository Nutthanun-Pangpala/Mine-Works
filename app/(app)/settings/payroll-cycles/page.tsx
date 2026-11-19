import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies, employmentTypes } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { saveCycle } from "@/app/actions/settings";
import { fd, todayBkk } from "@/lib/util";
import Notice from "@/components/Notice";

const FREQ: Record<string, string> = { monthly: "เดือนละ 1 งวด", semi: "เดือนละ 2 งวด", tri: "เดือนละ 3 งวด", weekly: "สัปดาห์ละงวด" };
const PAY: Record<string, string> = { last_day: "จ่ายเงินวันสุดท้ายของงวด", same_month: "วันที่ ... ในเดือนเดียวกัน", next_month: "วันที่ ... ในเดือนถัดไป" };

export default async function Cycles({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.payroll");
  const [rows, cos, ets] = await Promise.all([
    sql()`select c.*, c.first_start_date::text as fsd, co.name_th as company, et.name as et from payroll_cycles c
          join companies co on co.id = c.company_id join employment_types et on et.id = c.employment_type_id order by c.id`,
    companies(),
    employmentTypes(),
  ]);
  const edit = rows.find((r: any) => r.id === Number(sp.edit));
  return (
    <>
      <Notice sp={sp} />
      <div className="card">
        <h2>งวดเงินเดือน</h2>
        {rows.length === 0 ? <div className="empty">ยังไม่ได้กำหนดงวด — สร้างรอบการจ่ายเงินเดือนเพื่อเริ่มต้นการทำเงินเดือน</div> : null}
        <table className="tbl">
          <tbody>
            {rows.map((c: any) => (
              <tr key={c.id}>
                <td>{c.company}</td>
                <td>{c.et}</td>
                <td>{FREQ[c.frequency]}</td>
                <td>เริ่มงวดแรก {fd(c.fsd)}</td>
                <td>
                  {PAY[c.pay_rule].replace("...", String(c.pay_day ?? ""))}
                  {c.off_period_from ? <div className="small muted">ตัดรอบเวลา/OT วันที่ {c.off_period_from}</div> : null}
                </td>
                <td>{c.active ? "ใช้งาน" : "ปิด"}</td>
                <td>
                  <Link className="btn sm" href={`/settings/payroll-cycles?edit=${c.id}`}>
                    แก้ไข
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>{edit ? "แก้ไขงวดเงินเดือน" : "สร้างงวดเงินเดือน"}</h2>
        <form action={saveCycle} className="fields" key={edit?.id ?? "new"}>
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <label>
            บริษัท*
            <select name="company_id" defaultValue={edit?.company_id ?? cos[0]?.id} disabled={!!edit}>
              <Opt list={cos} label="name_th" empty={null} />
            </select>
          </label>
          {edit && <input type="hidden" name="company_id" value={edit.company_id} />}
          <label>
            ประเภทการจ้าง*
            <select name="employment_type_id" defaultValue={edit?.employment_type_id ?? ""} disabled={!!edit}>
              <Opt list={ets} empty={null} />
            </select>
          </label>
          {edit && <input type="hidden" name="employment_type_id" value={edit.employment_type_id} />}
          <label>
            งวดการจ่ายเงินเดือน*
            <select name="frequency" defaultValue={edit?.frequency ?? "monthly"}>
              {Object.entries(FREQ).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            วันที่เริ่มงวดแรกของปี*
            <input type="date" name="first_start_date" required defaultValue={edit?.fsd ?? `${todayBkk().slice(0, 4)}-01-01`} />
          </label>
          <label>
            วันที่จ่าย*
            <select name="pay_rule" defaultValue={edit?.pay_rule ?? "last_day"}>
              {Object.entries(PAY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            วันที่ (กรณีระบุวัน)
            <input type="number" min={1} max={31} name="pay_day" defaultValue={edit?.pay_day ?? ""} />
          </label>
          <label>
            ตัดรอบเวลาทำงาน/OT วันที่ (นอกงวด)
            <input type="number" min={1} max={31} name="off_period_from" defaultValue={edit?.off_period_from ?? ""} placeholder="เว้นว่าง = ตามงวด" />
          </label>
          {edit && (
            <label className="check">
              <input type="checkbox" name="active" defaultChecked={edit.active} /> ใช้งาน
            </label>
          )}
          <button className="btn primary">บันทึก</button>
        </form>
        <p className="small muted">หากวันจ่ายเงินตรงกับวันหยุด ควรเลื่อนจ่ายวันทำการก่อนหน้า (แก้ไขวันที่จ่ายได้ในงวด)</p>
      </div>
    </>
  );
}
