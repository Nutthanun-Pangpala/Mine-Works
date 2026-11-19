import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { employeesBrief, levels, roles } from "@/lib/lookups";
import { STEP_MODES, getWorkflow, resolveSteps } from "@/lib/workflow";
import { saveWorkflow } from "@/app/actions/settings";
import { DOC_TYPES, fullName } from "@/lib/util";
import Notice from "@/components/Notice";

const DOCS = ["leave", "offsite", "certify", "ot", "accumulate", "swap", "doc", "change_shift", "swap_shift", "welfare", "expense", "warning", "action"];

export default async function Workflows({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.org");
  const doc = DOCS.includes(sp.doc) ? sp.doc : "leave";
  const sub = Number(sp.sub) || null;
  const [subs, override, emps, lv, rl] = await Promise.all([
    ["leave", "offsite"].includes(doc) ? sql()`select id, name from leave_types where active and category = ${doc} order by sort` : Promise.resolve([]),
    sub ? sql()`select 1 from workflows where doc_type = ${doc} and sub_type_id = ${sub} and company_id is null` : Promise.resolve([]),
    employeesBrief(),
    levels(),
    roles(),
  ]);
  const steps = await getWorkflow(doc, sub, null);
  const usesMain = sub !== null && override.length === 0;
  const simEmp = Number(sp.sim) || null;
  const sim = simEmp ? await resolveSteps(simEmp, steps) : null;
  const rows = [...steps, { mode: "" }, { mode: "" }];
  const name = (id: number | null) => {
    const e = emps.find((x: any) => x.id === id);
    return e ? fullName(e) : "-";
  };
  return (
    <>
      <Notice sp={sp} />
      <div className="layout2" style={{ gridTemplateColumns: "220px 1fr" }}>
        <nav className="subnav">
          {DOCS.map((d) => (
            <Link key={d} href={`/settings/workflows?doc=${d}`} className={d === doc ? "on" : ""}>
              {DOC_TYPES[d]}
            </Link>
          ))}
        </nav>
        <div>
          {subs.length > 0 && (
            <nav className="tabs sm">
              <Link href={`/settings/workflows?doc=${doc}`} className={!sub ? "on" : ""}>
                เวิร์กโฟลว์หลัก
              </Link>
              {subs.map((s: any) => (
                <Link key={s.id} href={`/settings/workflows?doc=${doc}&sub=${s.id}`} className={sub === s.id ? "on" : ""}>
                  {s.name}
                </Link>
              ))}
            </nav>
          )}
          <div className="card">
            <h2>เงื่อนไขการอนุมัติ: {DOC_TYPES[doc]}</h2>
            <p className="muted small">ผู้ขออนุมัติ (ในทุกบริษัท) → ขั้นตอนตามลำดับด้านล่าง ทุกขั้นต้องอนุมัติจึงจะมีผล ไม่มีหัวหน้าในสายงานจะส่งให้บทบาทฝ่ายบุคคล</p>
            <form action={saveWorkflow}>
              <input type="hidden" name="doc_type" value={doc} />
              {sub && <input type="hidden" name="sub_type_id" value={sub} />}
              {sub && (
                <label className="check" style={{ marginBottom: 10 }}>
                  <input type="checkbox" name="use_main" defaultChecked={usesMain} /> ใช้เงื่อนไขเดียวกันกับเวิร์กโฟลว์หลัก
                </label>
              )}
              <table className="tbl compact">
                <thead>
                  <tr>
                    <th>ขั้น</th>
                    <th>ผู้อนุมัติ</th>
                    <th>ถึงระดับ / จำนวนขั้น / บุคคล / บทบาท</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s: any, i: number) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>
                        <select name="mode" defaultValue={s.mode}>
                          <option value="">(ไม่ใช้)</option>
                          {Object.entries(STEP_MODES).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="row">
                        <select name="level_code" defaultValue={s.level_code ?? ""} title="ถึงระดับตำแหน่ง">
                          <option value="">ระดับ</option>
                          {lv.map((l: any) => (
                            <option key={l.id} value={l.code}>
                              {l.code}
                            </option>
                          ))}
                        </select>
                        <input name="n" type="number" min={1} defaultValue={s.n ?? ""} placeholder="ขั้น" style={{ width: 70 }} />
                        <select name="employee_id" defaultValue={s.employee_id ?? ""}>
                          <option value="">บุคคล</option>
                          {emps.map((e: any) => (
                            <option key={e.id} value={e.id}>
                              {e.code} {fullName(e)}
                            </option>
                          ))}
                        </select>
                        <select name="role_id" defaultValue={s.role_id ?? rl.find((r: any) => r.code === s.role_code)?.id ?? ""}>
                          <option value="">บทบาท</option>
                          {rl.map((r: any) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn primary" style={{ marginTop: 10 }}>
                บันทึก
              </button>
            </form>
          </div>
          <div className="card">
            <h2>จำลองการอนุมัติ</h2>
            <form className="inline">
              <input type="hidden" name="doc" value={doc} />
              {sub && <input type="hidden" name="sub" value={sub} />}
              <select name="sim" defaultValue={simEmp ?? ""}>
                <option value="">เลือกผู้ขออนุมัติ</option>
                {emps.map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.code} {fullName(e)}
                  </option>
                ))}
              </select>
              <button className="btn">จำลอง</button>
            </form>
            {sim && (
              <ol style={{ marginTop: 10 }}>
                {sim.length === 0 ? <li>อนุมัติอัตโนมัติ (ไม่ต้องอนุมัติ)</li> : null}
                {sim.map((s, i) => (
                  <li key={i}>{s.approver_id ? name(s.approver_id) : `ผู้มีบทบาท ${rl.find((r: any) => r.id === s.role_id)?.name}`}</li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
