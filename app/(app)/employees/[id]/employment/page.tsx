import Link from "next/link";
import { sql } from "@/lib/db";
import { loadProfile } from "@/lib/profile";
import { branches, calendars, companies, employeesBrief, employmentTypes, options, positions, shiftsList, units } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { updateEmployment } from "@/app/actions/employees";
import { ACTION_KINDS, EMP_STATUS, REQ_STATUS, fd, fullName, money } from "@/lib/util";
import Notice from "@/components/Notice";
import Badge from "@/components/Badge";

export default async function Employment({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { e, canEdit, seeSalary } = await loadProfile(id);
  const [cos, brs, uns, pos, emps, shifts, cals, ets, etypes, locs, myLocs, chain, actions] = await Promise.all([
    companies(), branches(), units(), positions(), employeesBrief(), shiftsList(), calendars(), employmentTypes(), options("employee_type"),
    sql()`select id, name, mode from work_locations where active order by id`,
    sql()`select location_id from employee_locations where employee_id = ${e.id}`,
    sql()`
      with recursive c as (
        select id, supervisor_id, first_name, last_name, 0 as d from employees where id = ${e.id}
        union all select x.id, x.supervisor_id, x.first_name, x.last_name, c.d + 1 from employees x join c on x.id = c.supervisor_id where c.d < 10
      ) select * from c order by d desc`,
    sql()`
      select r.id, r.status, r.start_date::text as sd, r.payload, r.applied_at from requests r
      where r.employee_id = ${e.id} and r.doc_type = 'action' order by r.start_date desc, r.id desc`,
  ]);
  const mine = new Set(myLocs.map((l: any) => l.location_id));
  const grid = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" } as const;
  return (
    <>
      <Notice sp={sp} />
      <div className="card">
        <h2>ข้อมูลการจ้างงาน</h2>
        <form action={updateEmployment}>
          <input type="hidden" name="id" value={e.id} />
          <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
            <div style={grid}>
              <label>
                รหัสพนักงาน
                <input name="code" defaultValue={e.code} />
              </label>
              <label>
                สถานะ
                <select name="status" defaultValue={e.status}>
                  {Object.entries(EMP_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                บริษัท
                <select name="company_id" defaultValue={e.company_id ?? ""}>
                  <Opt list={cos} label="name_th" />
                </select>
              </label>
              <label>
                สาขา
                <select name="branch_id" defaultValue={e.branch_id ?? ""}>
                  <Opt list={brs} />
                </select>
              </label>
              <label>
                สังกัด
                <select name="org_unit_id" defaultValue={e.org_unit_id ?? ""}>
                  <Opt list={uns} label="path" />
                </select>
              </label>
              <label>
                ตำแหน่ง
                <select name="position_id" defaultValue={e.position_id ?? ""}>
                  <Opt list={pos} label={(p: any) => `${p.name}${p.level_code ? ` (${p.level_code})` : ""}`} />
                </select>
              </label>
              <label>
                ผู้บังคับบัญชา
                <select name="supervisor_id" defaultValue={e.supervisor_id ?? ""}>
                  <Opt list={emps.filter((x: any) => x.id !== e.id)} label={(x: any) => `${x.code} ${fullName(x)}`} />
                </select>
              </label>
              <label>
                วันที่เริ่มงาน
                <input type="date" name="start_date" defaultValue={e.sd ?? ""} />
              </label>
              <label>
                วันครบทดลองงาน
                <input type="date" name="probation_end_date" defaultValue={e.ped ?? ""} />
              </label>
              <label>
                วันที่บรรจุ
                <input type="date" name="confirm_date" defaultValue={e.cd ?? ""} />
              </label>
              <label>
                วันสิ้นสุดสัญญาจ้าง
                <input type="date" name="contract_end_date" defaultValue={e.ced ?? ""} />
              </label>
              <label>
                ประเภทการจ้าง
                <select name="employment_type_id" defaultValue={e.employment_type_id ?? ""}>
                  <Opt list={ets} />
                </select>
              </label>
              <label>
                ประเภทพนักงาน
                <select name="employee_type_id" defaultValue={e.employee_type_id ?? ""}>
                  <Opt list={etypes} />
                </select>
              </label>
              <label>
                กะการทำงาน
                <select name="shift_id" defaultValue={e.shift_id ?? ""}>
                  <Opt list={shifts} label={(s: any) => `${s.code} ${s.name}`} />
                </select>
              </label>
              <label>
                ปฏิทินวันหยุด
                <select name="calendar_id" defaultValue={e.calendar_id ?? ""}>
                  <Opt list={cals} empty="ปฏิทินตั้งต้น" />
                </select>
              </label>
              <label>
                สถานที่ทำงาน
                <input name="work_location" defaultValue={e.work_location ?? ""} />
              </label>
              <label>
                เลขที่ใบขับขี่
                <input name="driver_license" defaultValue={e.driver_license ?? ""} />
              </label>
              <label className="check">
                <input type="checkbox" name="clock_required" defaultChecked={e.clock_required} /> บันทึกเวลาเข้าออก
              </label>
              <label className="check">
                <input type="checkbox" name="diligence_enabled" defaultChecked={e.diligence_enabled} /> ได้รับเบี้ยขยัน
              </label>
              <label className="full">
                สถานที่เวิร์กอินที่อนุญาต (ไม่เลือก = ลงเวลาได้ทุกที่)
                <select name="location_ids" multiple size={Math.min(6, Math.max(2, locs.length))} defaultValue={[...mine].map(String)}>
                  {locs.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {canEdit && (
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn primary">บันทึก</button>
                <span className="muted small">การเปลี่ยนแปลงที่ต้องอนุมัติ (เลื่อนตำแหน่ง โอนย้าย พ้นสภาพ) ให้ใช้เมนู “การดำเนินการ”</span>
              </div>
            )}
          </fieldset>
        </form>
      </div>
      <div className="card">
        <h2>สายบังคับบัญชา</h2>
        <div>
          {chain.map((c: any, i: number) => (
            <span key={c.id}>
              {i > 0 ? " → " : ""}
              {c.id === e.id ? <b>{fullName(c)}</b> : <Link href={`/employees/${c.id}`}>{fullName(c)}</Link>}
            </span>
          ))}
        </div>
      </div>
      <div className="card">
        <h2>การดำเนินการ</h2>
        {actions.length === 0 ? <div className="empty">ยังไม่มี</div> : null}
        <table className="tbl compact">
          <tbody>
            {actions.map((a: any) => (
              <tr key={a.id}>
                <td>
                  <Link href={`/documents/${a.id}`}>#{a.id}</Link>
                </td>
                <td>{ACTION_KINDS[a.payload?.kind]}</td>
                <td>มีผล {fd(a.sd)}</td>
                <td>{seeSalary && a.payload?.salary_after ? money(a.payload.salary_after) : ""}</td>
                <td>
                  <Badge status={a.status} label={REQ_STATUS[a.status]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
