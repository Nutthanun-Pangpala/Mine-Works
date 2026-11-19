import Link from "next/link";
import { can, requireUser, subordinateIds } from "@/lib/auth";
import { sql } from "@/lib/db";
import { quotasFor } from "@/lib/leave";
import { options, shiftsList } from "@/lib/lookups";
import { createDocument } from "@/app/actions/documents";
import { CERT_DOCS, DOC_TYPES, WARNING_LEVELS, fullName, minutesText, num, todayBkk } from "@/lib/util";
import Notice from "@/components/Notice";

export default async function NewDocument({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const type = String(sp.type || "leave");
  const today = todayBkk();

  // filing on behalf
  let forId = Number(sp.for) || u.id;
  const behalfAllowed = can(u, "documents.onbehalf", "create");
  let candidates: any[] = [];
  if (behalfAllowed) {
    if (u.isHR) candidates = await sql()`select id, code, first_name, last_name from employees where status <> 'terminated' order by code`;
    else {
      const ids = await subordinateIds(u.id);
      candidates = ids.length ? await sql().query(`select id, code, first_name, last_name from employees where id = any($1::int[]) order by code`, [ids]) : [];
    }
  }
  if (forId !== u.id && !candidates.some((c) => c.id === forId)) forId = u.id;
  const emp = (await sql()`select id, first_name, last_name, gender, shift_id from employees where id = ${forId}`)[0];

  const [leaveTypes, offTypes, quotas, otReasons, shifts, welfare, rules, colleagues, balance] = await Promise.all([
    sql()`select id, name, rules from leave_types where active and category = 'leave' order by sort, id`,
    sql()`select id, name from leave_types where active and category = 'offsite' order by sort, id`,
    type === "leave" ? quotasFor(forId, today) : Promise.resolve([]),
    options("ot_reason"),
    shiftsList(),
    sql()`select id, name, budget_per_year from welfare_types where active order by id`,
    options("company_rule"),
    type === "swap_shift"
      ? sql()`select id, code, first_name, last_name from employees where status <> 'terminated' and id <> ${forId}
              and (supervisor_id = (select supervisor_id from employees where id = ${forId}) or org_unit_id = (select org_unit_id from employees where id = ${forId}))
              order by code`
      : Promise.resolve([]),
    type === "swap"
      ? sql()`
          select coalesce(sum(case when doc_type = 'accumulate' and status = 'approved' then minutes else 0 end), 0)
               - coalesce(sum(case when doc_type = 'swap' and status in ('approved','pending') then minutes else 0 end), 0) as m
          from requests where employee_id = ${forId} and doc_type in ('accumulate','swap')`
      : Promise.resolve([{ m: 0 }]),
  ]);

  const title = DOC_TYPES[type] || "เอกสาร";
  const allowedForGender = (r: any) => !r.rules?.gender || r.rules.gender === "all" || !emp?.gender || r.rules.gender === emp.gender;

  return (
    <>
      <div className="head">
        <div>
          <h1>{title}</h1>
          <div className="muted">
            <Link href="/documents">เอกสารของฉัน</Link> / สร้างเอกสาร
          </div>
        </div>
      </div>
      <Notice sp={sp} />

      {behalfAllowed && candidates.length > 0 && (
        <form className="inline card" style={{ padding: 12 }}>
          <input type="hidden" name="type" value={type} />
          <label>
            สร้างเอกสารแทนพนักงาน
            <select name="for" defaultValue={forId}>
              <option value={u.id}>ตนเอง</option>
              {candidates
                .filter((c) => c.id !== u.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} {fullName(c)}
                  </option>
                ))}
            </select>
          </label>
          <button className="btn">เลือก</button>
        </form>
      )}

      <div className="cols">
        <div className="card">
          <h2>
            {title} {forId !== u.id ? `ให้ ${fullName(emp)}` : ""}
          </h2>
          <form action={createDocument} className="fields">
            <input type="hidden" name="doc_type" value={type} />
            <input type="hidden" name="employee_id" value={forId} />

            {(type === "leave" || type === "offsite") && (
              <>
                <label className="full">
                  ประเภท*
                  <select name="sub_type_id" required>
                    <option value="">กรุณาเลือก</option>
                    {(type === "leave" ? leaveTypes.filter(allowedForGender) : offTypes).map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="full row">
                  <label className="check">
                    <input type="radio" name="mode" value="full" defaultChecked /> ทั้งวัน
                  </label>
                  <label className="check">
                    <input type="radio" name="mode" value="hours" /> ระบุชั่วโมง
                  </label>
                </div>
                <label>
                  วันที่เริ่ม*
                  <input type="date" name="start_date" required defaultValue={today} />
                </label>
                <label>
                  ถึงวันที่ (ทั้งวัน)
                  <input type="date" name="end_date" defaultValue={today} />
                </label>
                <label>
                  เวลาเริ่ม (ระบุชั่วโมง)
                  <input type="time" name="start_time" />
                </label>
                <label>
                  เวลาสิ้นสุด (ระบุชั่วโมง)
                  <input type="time" name="end_time" />
                </label>
                {type === "offsite" && (
                  <label className="full">
                    สถานที่
                    <input name="place" />
                  </label>
                )}
              </>
            )}

            {type === "certify" && (
              <>
                <label>
                  วันที่*
                  <input type="date" name="start_date" required max={today} defaultValue={today} />
                </label>
                <label>
                  เวลาเข้างาน
                  <input type="time" name="in_time" />
                </label>
                <label>
                  เวลาออกงาน
                  <input type="time" name="out_time" />
                </label>
                <label className="check">
                  <input type="checkbox" name="out_next_day" /> ออกงานวันถัดไป
                </label>
              </>
            )}

            {(type === "ot" || type === "accumulate" || type === "swap") && (
              <>
                <label>
                  วันที่*
                  <input type="date" name="start_date" required defaultValue={today} />
                </label>
                <label>
                  ตั้งแต่เวลา*
                  <input type="time" name="start_time" required />
                </label>
                <label>
                  ถึงเวลา*
                  <input type="time" name="end_time" required />
                </label>
                {type === "ot" && (
                  <>
                    <label>
                      เหตุผล*
                      <select name="reason_id" required>
                        <option value="">กรุณาเลือก</option>
                        {otReasons.map((r: any) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      ประเภทค่าล่วงเวลา
                      <select name="ot_kind" defaultValue="auto">
                        <option value="auto">อัตโนมัติตามวันทำงาน</option>
                        <option value="ot2">OT2 ล่วงเวลาในวันทำงาน</option>
                        <option value="ot1">OT1 ทำงานในวันหยุด (รายเดือน)</option>
                        <option value="ot3">OT3 ทำงานในวันหยุด (รายวัน)</option>
                        <option value="ot4">OT4 ล่วงเวลาในวันหยุด</option>
                      </select>
                    </label>
                  </>
                )}
                {type === "swap" && <div className="full muted small">เวลาสะสมคงเหลือ {minutesText(Number(balance[0]?.m || 0))}</div>}
              </>
            )}

            {type === "doc" && (
              <>
                <label className="full">
                  เอกสารที่ต้องการ*
                  <select name="cert" required>
                    {Object.entries(CERT_DOCS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  จำนวนฉบับ
                  <input type="number" name="copies" min={1} defaultValue={1} />
                </label>
                <label>
                  ภาษา
                  <select name="lang">
                    <option value="th">ไทย</option>
                    <option value="en">อังกฤษ</option>
                  </select>
                </label>
              </>
            )}

            {type === "change_shift" && (
              <>
                <label>
                  ตั้งแต่วันที่*
                  <input type="date" name="start_date" required defaultValue={today} />
                </label>
                <label>
                  ถึงวันที่
                  <input type="date" name="end_date" defaultValue={today} />
                </label>
                <label className="full">
                  กะใหม่
                  <select name="shift_id">
                    <option value="">วันหยุด</option>
                    {shifts.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.code} {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {type === "swap_shift" && (
              <>
                <label>
                  วันที่*
                  <input type="date" name="start_date" required defaultValue={today} />
                </label>
                <label className="full">
                  สลับกะกับ*
                  <select name="with_employee_id" required>
                    <option value="">กรุณาเลือก</option>
                    {colleagues.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.code} {fullName(c)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {(type === "welfare" || type === "expense") && (
              <>
                {type === "welfare" ? (
                  <label className="full">
                    สวัสดิการ*
                    <select name="sub_type_id" required>
                      {welfare.map((w: any) => (
                        <option key={w.id} value={w.id}>
                          {w.name} {w.budget_per_year ? `(วงเงิน ${num(w.budget_per_year)} บาท/ปี)` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="full">
                    หมวดค่าใช้จ่าย
                    <input name="category" placeholder="เช่น ค่าเดินทาง ค่าที่พัก" />
                  </label>
                )}
                <label>
                  วันที่ใบเสร็จ*
                  <input type="date" name="start_date" required defaultValue={today} />
                </label>
                <label>
                  จำนวนเงิน (บาท)*
                  <input type="number" step="0.01" name="amount" required />
                </label>
              </>
            )}

            {type === "warning" && (
              <>
                <label>
                  วันที่*
                  <input type="date" name="start_date" required defaultValue={today} />
                </label>
                <label>
                  ระดับ
                  <select name="level">
                    {Object.entries(WARNING_LEVELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="full">
                  กฎระเบียบที่ฝ่าฝืน
                  <select name="reason_id">
                    <option value="">-</option>
                    {rules.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label className="full">
              {type === "ot" ? "รายละเอียดงาน*" : type === "leave" || type === "certify" ? "ข้อมูลเพิ่มเติม*" : "รายละเอียด"}
              <textarea name="detail" rows={3} required={["leave", "ot", "certify", "welfare", "expense", "warning"].includes(type)} />
            </label>
            <label className="full">
              ไฟล์แนบ (ไม่เกิน 4 MB)
              <input type="file" name="file" />
            </label>
            <div className="full row">
              <button className="btn primary">ส่งเอกสาร</button>
              <Link className="btn" href="/documents">
                ยกเลิก
              </Link>
            </div>
          </form>
        </div>

        {type === "leave" && (
          <div className="card">
            <h2>สิทธิ์การลาปีนี้</h2>
            <table className="tbl compact">
              <thead>
                <tr>
                  <th>ประเภท</th>
                  <th className="num">สิทธิ์</th>
                  <th className="num">ใช้ไป</th>
                  <th className="num">รออนุมัติ</th>
                  <th className="num">คงเหลือ</th>
                </tr>
              </thead>
              <tbody>
                {quotas.map((q) => (
                  <tr key={q.type_id}>
                    <td>{q.name}</td>
                    <td className="num">{q.entitled === null ? "ไม่จำกัด" : num(q.entitled + q.carried, 2)}</td>
                    <td className="num">{num(q.used, 2)}</td>
                    <td className="num">{num(q.pending, 2)}</td>
                    <td className="num">{q.remaining === null ? "-" : num(q.remaining, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
