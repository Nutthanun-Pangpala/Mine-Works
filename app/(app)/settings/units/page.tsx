import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies, employeesBrief } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { deleteUnit, saveUnit } from "@/app/actions/settings";
import { fullName } from "@/lib/util";
import Notice from "@/components/Notice";
import ConfirmButton from "@/components/ConfirmButton";

const KIND: Record<string, string> = { division: "ฝ่าย", department: "แผนก", section: "ส่วน", unit: "หน่วย" };

export default async function Units({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.org");
  const cos = await companies();
  const cid = Number(sp.company) || cos[0]?.id;
  const [rows, emps, counts] = await Promise.all([
    sql()`select u.*, h.first_name as hf, h.last_name as hl from org_units u left join employees h on h.id = u.head_employee_id
          where u.company_id = ${cid} order by u.sort, u.name`,
    employeesBrief(),
    sql()`select org_unit_id, count(*)::int as n from employees where status <> 'terminated' group by org_unit_id`,
  ]);
  const editing = rows.find((r: any) => r.id === Number(sp.edit));
  const count = (id: number) => counts.find((c: any) => c.org_unit_id === id)?.n || 0;
  const tree = (parent: number | null): any => {
    const kids = rows.filter((r: any) => (r.parent_id ?? null) === parent);
    if (!kids.length) return null;
    return (
      <ul className={parent === null ? "tree root" : "tree"}>
        {kids.map((k: any) => (
          <li key={k.id}>
            <span className="badge">{KIND[k.kind]}</span> <b style={{ opacity: k.active ? 1 : 0.5 }}>{k.name}</b>{" "}
            <span className="small muted">
              {k.code ? `(${k.code})` : ""} · {count(k.id)} คน {k.hf ? `· หัวหน้า ${k.hf} ${k.hl}` : ""}
            </span>{" "}
            <Link className="small" href={`/settings/units?company=${cid}&edit=${k.id}`}>
              แก้ไข
            </Link>{" "}
            <Link className="small" href={`/settings/units?company=${cid}&parent=${k.id}`}>
              + หน่วยงานย่อย
            </Link>
            {tree(k.id)}
          </li>
        ))}
      </ul>
    );
  };
  const f = editing || { parent_id: Number(sp.parent) || null, kind: sp.parent ? "department" : "division", active: true };
  return (
    <>
      <Notice sp={sp} />
      <form className="inline" style={{ marginBottom: 12 }}>
        <select name="company" defaultValue={cid}>
          <Opt list={cos} label="name_th" empty={null} />
        </select>
        <button className="btn">เลือกบริษัท</button>
        <Link className="btn" href="/reports/orgchart">
          ดูผังองค์กร
        </Link>
      </form>
      <div className="cols">
        <div className="card">
          <h2>โครงสร้างองค์กร</h2>
          {rows.length === 0 ? <div className="empty">ยังไม่มีหน่วยงาน</div> : tree(null)}
        </div>
        <div className="card">
          <h2>{editing ? `แก้ไข ${editing.name}` : "เพิ่มหน่วยงาน"}</h2>
          <form action={saveUnit} className="fields" key={editing?.id ?? "new" + (sp.parent || "")}>
            <input type="hidden" name="company_id" value={cid} />
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <label>
              ประเภท
              <select name="kind" defaultValue={f.kind}>
                {Object.entries(KIND).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ภายใต้
              <select name="parent_id" defaultValue={f.parent_id ?? ""}>
                <Opt list={rows.filter((r: any) => r.id !== editing?.id)} empty="(ระดับบนสุด)" />
              </select>
            </label>
            <label>
              ชื่อ*
              <input name="name" required defaultValue={f.name ?? ""} />
            </label>
            <label>
              ชื่อ (EN)
              <input name="name_en" defaultValue={f.name_en ?? ""} />
            </label>
            <label>
              รหัส
              <input name="code" defaultValue={f.code ?? ""} />
            </label>
            <label>
              Cost Center
              <input name="cost_center" defaultValue={f.cost_center ?? ""} />
            </label>
            <label>
              หัวหน้าหน่วยงาน
              <select name="head_employee_id" defaultValue={f.head_employee_id ?? ""}>
                <Opt list={emps} label={(e: any) => `${e.code} ${fullName(e)}`} />
              </select>
            </label>
            <label>
              ลำดับ
              <input type="number" name="sort" defaultValue={f.sort ?? 0} />
            </label>
            <label className="check">
              <input type="checkbox" name="active" defaultChecked={f.active} /> ใช้งาน
            </label>
            <div className="row full">
              <button className="btn primary">บันทึก</button>
              {editing && (
                <Link className="btn" href={`/settings/units?company=${cid}`}>
                  ยกเลิก
                </Link>
              )}
            </div>
          </form>
          {editing && (
            <form action={deleteUnit} style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="company_id" value={cid} />
              <ConfirmButton message="ลบหน่วยงานนี้?">ลบหน่วยงาน</ConfirmButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
