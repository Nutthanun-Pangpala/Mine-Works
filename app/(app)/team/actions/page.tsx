import Link from "next/link";
import { can, requireUser, teamScope } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies, employmentTypes, options, positions, shiftsList, units, branches } from "@/lib/lookups";
import { teamMembers } from "@/lib/team";
import { createAction } from "@/app/actions/team";
import { ACTION_KINDS, REQ_STATUS, fd, fullName, money, todayBkk } from "@/lib/util";
import Notice from "@/components/Notice";
import Badge from "@/components/Badge";

export default async function Actions({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const scope = await teamScope(u);
  const ids = scope === "all" ? null : scope;
  const kind = ACTION_KINDS[sp.kind] ? sp.kind : "salary_adjust";
  const [rows, members, pos, uns, brs, cos, ets, etypes, shifts, reasons] = await Promise.all([
    ids && ids.length === 0
      ? Promise.resolve([])
      : sql().query(
          `select r.*, r.start_date::text as sd, e.code, e.first_name, e.last_name
           from requests r join employees e on e.id = r.employee_id
           where r.doc_type = 'action' and ($1::int[] is null or r.employee_id = any($1::int[]))
           order by r.created_at desc limit 200`,
          [ids],
        ),
    teamMembers(u),
    positions(),
    units(),
    branches(),
    companies(),
    employmentTypes(),
    options("employee_type"),
    shiftsList(),
    options("separation_reason"),
  ]);
  const allEmps = kind === "rehire" ? await sql()`select id, code, first_name, last_name from employees where status = 'terminated' order by code` : members;
  const canCreate = can(u, "team.actions", "create");

  return (
    <>
      <Notice sp={sp} />
      {canCreate && (
        <div className="card">
          <h2>สร้างการดำเนินการ</h2>
          <nav className="tabs sm">
            {Object.entries(ACTION_KINDS).map(([k, v]) => (
              <Link key={k} href={`/team/actions?kind=${k}`} className={k === kind ? "on" : ""}>
                {v}
              </Link>
            ))}
          </nav>
          <form action={createAction} className="fields">
            <input type="hidden" name="kind" value={kind} />
            <label>
              พนักงาน*
              <select name="employee_id" required>
                <option value="">กรุณาเลือก</option>
                {allEmps.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.code} {fullName(m)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              วันที่มีผล*
              <input type="date" name="effective_date" required defaultValue={todayBkk()} />
            </label>
            {["promote", "rehire"].includes(kind) && (
              <label>
                ตำแหน่งใหม่
                <select name="position_id">
                  <option value="">-</option>
                  {pos.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.level_code ? `(${p.level_code})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {["confirm", "promote", "salary_adjust", "change_terms", "rehire"].includes(kind) && (
              <label>
                เงินเดือน/ค่าจ้างใหม่{kind === "salary_adjust" ? "*" : ""}
                <input type="number" step="0.01" name="salary_after" required={kind === "salary_adjust"} />
              </label>
            )}
            {["change_supervisor", "transfer_unit", "transfer_company"].includes(kind) && (
              <label>
                ผู้บังคับบัญชาใหม่
                <select name="supervisor_id">
                  <option value="">-</option>
                  {members.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.code} {fullName(m)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {kind === "transfer_company" && (
              <label>
                บริษัทใหม่
                <select name="company_id">
                  {cos.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name_th}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {["transfer_unit", "transfer_company"].includes(kind) && (
              <>
                <label>
                  หน่วยงานใหม่
                  <select name="org_unit_id">
                    <option value="">-</option>
                    {uns.map((x: any) => (
                      <option key={x.id} value={x.id}>
                        {x.path}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  สาขา
                  <select name="branch_id">
                    <option value="">-</option>
                    {brs.map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {kind === "change_terms" && (
              <>
                <label>
                  ประเภทการจ้าง
                  <select name="employment_type_id">
                    <option value="">ไม่เปลี่ยน</option>
                    {ets.map((x: any) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  ประเภทพนักงาน
                  <select name="employee_type_id">
                    <option value="">ไม่เปลี่ยน</option>
                    {etypes.map((x: any) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  กะการทำงาน
                  <select name="shift_id">
                    <option value="">ไม่เปลี่ยน</option>
                    {shifts.map((x: any) => (
                      <option key={x.id} value={x.id}>
                        {x.code} {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  วันสิ้นสุดสัญญาจ้าง
                  <input type="date" name="contract_end_date" />
                </label>
              </>
            )}
            {kind === "terminate" && (
              <label>
                เหตุผลการพ้นสภาพ*
                <select name="separation_reason_id" required>
                  {reasons.map((x: any) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {kind === "rehire" && (
              <label>
                วันครบทดลองงาน
                <input type="date" name="probation_end_date" />
              </label>
            )}
            <label className="full">
              หมายเหตุ
              <textarea name="detail" rows={2} />
            </label>
            <button className="btn primary">ส่งอนุมัติ</button>
          </form>
        </div>
      )}
      <div className="card scroll">
        <h2>ประวัติการดำเนินการ</h2>
        {rows.length === 0 ? <div className="empty">ยังไม่มี</div> : null}
        <table className="tbl">
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/documents/${r.id}`}>#{r.id}</Link>
                </td>
                <td>
                  {fullName(r)}
                  <div className="small muted">{r.code}</div>
                </td>
                <td>{ACTION_KINDS[r.payload?.kind]}</td>
                <td>มีผล {fd(r.sd)}</td>
                <td>{r.payload?.salary_after ? money(r.payload.salary_after) : ""}</td>
                <td>
                  <Badge status={r.status} label={REQ_STATUS[r.status]} />
                  {r.status === "approved" && !r.applied_at ? <span className="small muted"> (รอวันมีผล)</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
