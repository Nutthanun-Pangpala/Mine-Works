import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { loadProfile } from "@/lib/profile";
import { roles } from "@/lib/lookups";
import { updateAccount } from "@/app/actions/employees";
import { fdt } from "@/lib/util";
import Notice from "@/components/Notice";

export default async function Account({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { e, canAccount } = await loadProfile(id);
  if (!canAccount) notFound();
  const [all, mine, logs] = await Promise.all([
    roles(),
    sql()`select role_id from user_roles where employee_id = ${e.id}`,
    sql()`select action, created_at from audit_logs where actor_id = ${e.id} order by created_at desc limit 10`,
  ]);
  const has = new Set(mine.map((r: any) => r.role_id));
  return (
    <>
      <Notice sp={sp} />
      <div className="card">
        <h2>ข้อมูลบัญชี</h2>
        <form action={updateAccount} className="fields">
          <input type="hidden" name="id" value={e.id} />
          <label className="full">
            ชื่อผู้ใช้งาน
            <input value={e.work_email || e.code} disabled />
          </label>
          <label className="check full">
            <input type="checkbox" name="login_enabled" defaultChecked={e.login_enabled} /> อนุญาตให้เข้าสู่ระบบ
          </label>
          <label>
            ตั้งรหัสผ่านใหม่ (เว้นว่าง = ไม่เปลี่ยน)
            <input type="password" name="password" minLength={8} autoComplete="new-password" />
          </label>
          <div className="full">
            <div className="muted small" style={{ marginBottom: 6 }}>
              บทบาท (Staff และ Supervisor กำหนดให้อัตโนมัติ)
            </div>
            <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              {all
                .filter((r: any) => !r.auto)
                .map((r: any) => (
                  <label key={r.id} className="check">
                    <input type="checkbox" name="role_ids" value={r.id} defaultChecked={has.has(r.id)} /> {r.name}
                  </label>
                ))}
            </div>
          </div>
          <button className="btn primary">บันทึก</button>
        </form>
      </div>
      <div className="card">
        <h2>การใช้งานล่าสุด</h2>
        <table className="tbl compact">
          <tbody>
            {logs.map((l: any, i: number) => (
              <tr key={i}>
                <td>{l.action}</td>
                <td>{fdt(l.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
