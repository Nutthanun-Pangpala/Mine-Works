import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { employeesBrief } from "@/lib/lookups";
import { PAYROLL_PERMS, PERM_GROUPS } from "@/lib/perm";
import { saveGroup, saveRole } from "@/app/actions/settings";
import { fullName } from "@/lib/util";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";

export default async function Users({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.system");
  const tab = ["roles", "groups"].includes(sp.tab) ? sp.tab : "users";
  return (
    <>
      <Notice sp={sp} />
      <Tabs
        small
        tabs={[
          { href: "/settings/users", label: "ข้อมูลผู้ใช้", on: tab === "users" },
          { href: "/settings/users?tab=roles", label: "บทบาทและกำหนดสิทธิ์ผู้ใช้งาน", on: tab === "roles" },
          { href: "/settings/users?tab=groups", label: "กลุ่ม", on: tab === "groups" },
        ]}
      />
      {tab === "users" && <UserList q={String(sp.q || "")} role={Number(sp.role) || null} />}
      {tab === "roles" && <Roles id={Number(sp.role) || null} isNew={sp.new === "1"} />}
      {tab === "groups" && <Groups edit={Number(sp.edit) || null} />}
    </>
  );
}

async function UserList({ q, role }: { q: string; role: number | null }) {
  const [rows, roles] = await Promise.all([
    sql().query(
      `select e.id, e.code, e.first_name, e.last_name, e.work_email, e.login_enabled, e.status, e.password_hash is not null as has_pw,
              s.first_name as sf, s.last_name as sl,
              coalesce((select string_agg(r.name, ', ' order by r.id) from user_roles ur join roles r on r.id = ur.role_id where ur.employee_id = e.id), '') as roles
       from employees e left join employees s on s.id = e.supervisor_id
       where e.status <> 'terminated'
         and ($1 = '' or e.code ilike $1 or e.first_name ilike $1 or e.last_name ilike $1 or coalesce(e.work_email,'') ilike $1)
         and ($2::int is null or exists (select 1 from user_roles ur where ur.employee_id = e.id and ur.role_id = $2))
       order by e.code`,
      [q ? `%${q}%` : "", role],
    ),
    sql()`select id, name from roles where auto is null order by id`,
  ]);
  return (
    <>
      <form className="inline" style={{ marginBottom: 10 }}>
        <input name="q" placeholder="ค้นหา" defaultValue={q} />
        <select name="role" defaultValue={role ?? ""}>
          <option value="">ทุกบทบาท</option>
          {roles.map((r: any) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button className="btn">ค้นหา</button>
      </form>
      <div className="card scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>รหัส</th>
              <th>รายชื่อ</th>
              <th>อีเมล</th>
              <th>ยืนยันตัวตน</th>
              <th>บทบาท</th>
              <th>ผู้บังคับบัญชา</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e: any) => (
              <tr key={e.id}>
                <td>{e.code}</td>
                <td>
                  <Link href={`/employees/${e.id}/account`}>{fullName(e)}</Link>
                </td>
                <td>{e.work_email || "-"}</td>
                <td>{e.has_pw ? "ตั้งรหัสผ่านแล้ว" : <span className="badge pending">ยังไม่มีรหัสผ่าน</span>}</td>
                <td className="wrap">{["Staff", e.roles].filter(Boolean).join(", ")}</td>
                <td>{e.sf ? `${e.sf} ${e.sl}` : "-"}</td>
                <td>{e.login_enabled ? "ใช้งาน" : "ระงับ"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function Roles({ id, isNew }: { id: number | null; isNew: boolean }) {
  const roles = await sql()`
    select r.*, (select count(*)::int from user_roles ur where ur.role_id = r.id) as n from roles r order by r.id`;
  const r = isNew ? null : roles.find((x: any) => x.id === id) || roles[0];
  const perms = r?.permissions || {};
  const all = !!perms["*"];
  const has = (k: string, a: string) => all || (perms[k] || []).includes(a);
  const payroll: string[] = r?.payroll_perms || [];
  const locked = r?.code === "ADMIN";
  return (
    <div className="layout2" style={{ gridTemplateColumns: "220px 1fr" }}>
      <nav className="subnav">
        {roles.map((x: any) => (
          <Link key={x.id} href={`/settings/users?tab=roles&role=${x.id}`} className={r?.id === x.id ? "on" : ""}>
            {x.name} <span className="small muted">({x.auto === "everyone" ? "ทุกคน" : x.auto === "supervisor" ? "มีผู้ใต้บังคับบัญชา" : x.n})</span>
          </Link>
        ))}
        <Link href="/settings/users?tab=roles&new=1" className={isNew ? "on" : ""}>
          + เพิ่มบทบาท
        </Link>
      </nav>
      <form action={saveRole} className="card" key={r?.id ?? "new"}>
        {r && <input type="hidden" name="id" value={r.id} />}
        <div className="fields" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          {!r && (
            <label>
              รหัสบทบาท*
              <input name="code" required />
            </label>
          )}
          <label>
            ชื่อบทบาท*
            <input name="name" required defaultValue={r?.name ?? ""} />
          </label>
          <label className="full">
            รายละเอียด
            <input name="description" defaultValue={r?.description ?? ""} />
          </label>
          <label className="check">
            <input type="checkbox" name="is_hr" defaultChecked={!!r?.is_hr} disabled={locked} /> เป็น HR (เห็นข้อมูลทีมทุกคน)
          </label>
          {r && (
            <label className="check">
              <input type="checkbox" name="active" defaultChecked={r.active} disabled={locked} /> ใช้งาน
            </label>
          )}
        </div>
        {locked && <p className="notice">Administrator มีสิทธิ์เต็มทุกฟีเจอร์ (แก้ไขได้เฉพาะชื่อและรายละเอียด)</p>}
        <h2 style={{ marginTop: 16 }}>กำหนดสิทธิ์ผู้ใช้งาน</h2>
        <table className="tbl compact matrix">
          <thead>
            <tr>
              <th>การตั้งค่าฟีเจอร์</th>
              <th>เข้าถึง</th>
              <th>สร้าง</th>
              <th>แก้ไข</th>
              <th>ลบ</th>
            </tr>
          </thead>
          <tbody>
            {PERM_GROUPS.map((g) => [
              <tr key={g.group}>
                <td colSpan={5}>
                  <b>{g.group}</b>
                </td>
              </tr>,
              ...g.items.map((it) => (
                <tr key={it.key}>
                  <td>{it.label}</td>
                  {(["view", "create", "edit", "delete"] as const).map((a) => (
                    <td key={a}>
                      {it.acts.includes(a) ? <input type="checkbox" name={`p:${it.key}:${a}`} defaultChecked={has(it.key, a)} disabled={locked} /> : null}
                    </td>
                  ))}
                </tr>
              )),
            ])}
          </tbody>
        </table>
        <h2 style={{ marginTop: 16 }}>สิทธิ์การทำเงินเดือน</h2>
        <div style={{ display: "grid", gap: 6 }}>
          {PAYROLL_PERMS.map((p) => (
            <label key={p.key} className="check">
              <input type="checkbox" name="payroll" value={p.key} defaultChecked={locked || payroll.includes(p.key)} disabled={locked} /> <b>{p.label}</b>{" "}
              <span className="small muted">{p.desc}</span>
            </label>
          ))}
        </div>
        <button className="btn primary" style={{ marginTop: 14 }}>
          บันทึก
        </button>
        {r && (
          <p className="small muted">
            มอบหมายบทบาทให้พนักงานได้ที่ <Link href={`/settings/users?role=${r.id}`}>ข้อมูลผู้ใช้</Link> → เลือกพนักงาน → ข้อมูลบัญชี
          </p>
        )}
      </form>
    </div>
  );
}

async function Groups({ edit }: { edit: number | null }) {
  const [groups, emps, members] = await Promise.all([
    sql()`select g.*, (select count(*)::int from user_group_members m where m.group_id = g.id) as n from user_groups g order by g.id`,
    employeesBrief(),
    edit ? sql()`select employee_id from user_group_members where group_id = ${edit}` : Promise.resolve([]),
  ]);
  const g = groups.find((x: any) => x.id === edit);
  const mem = new Set(members.map((m: any) => String(m.employee_id)));
  return (
    <>
      <div className="card">
        {groups.length === 0 ? <div className="empty">ยังไม่มีกลุ่ม</div> : null}
        <table className="tbl">
          <tbody>
            {groups.map((x: any) => (
              <tr key={x.id}>
                <td>{x.name}</td>
                <td>{x.description}</td>
                <td>{x.n} คน</td>
                <td>
                  <Link className="btn sm" href={`/settings/users?tab=groups&edit=${x.id}`}>
                    แก้ไข
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={saveGroup} className="card fields" key={g?.id ?? "new"}>
        {g && <input type="hidden" name="id" value={g.id} />}
        <label>
          ชื่อกลุ่ม*
          <input name="name" required defaultValue={g?.name ?? ""} />
        </label>
        <label>
          รายละเอียด
          <input name="description" defaultValue={g?.description ?? ""} />
        </label>
        <label className="full">
          สมาชิก
          <select name="member_ids" multiple size={10} defaultValue={[...mem].map(String)}>
            {emps.map((e: any) => (
              <option key={e.id} value={e.id}>
                {e.code} {fullName(e)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary">{g ? "บันทึก" : "เพิ่มกลุ่ม"}</button>
      </form>
    </>
  );
}
