import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { applyDueActions } from "@/lib/personnel";
import { logout } from "@/app/actions/auth";
import Nav, { NavItem } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  await applyDueActions();
  const roleIds = u.roles.map((r) => r.id);
  const admin = u.roles.some((r) => r.code === "ADMIN");
  const [pending, unread, company] = await Promise.all([
    sql()`
      select count(distinct s.request_id)::int as n from request_steps s join requests r on r.id = s.request_id
      where s.status = 'pending' and r.status = 'pending' and (${admin}::boolean or s.approver_id = ${u.id} or s.role_id = any(${roleIds}::int[]))`,
    sql()`select count(*)::int as n from notifications where employee_id = ${u.id} and read_at is null`,
    sql()`select name_th from companies where id = ${u.company_id}`,
  ]);

  const items: NavItem[] = [
    { href: "/", label: "หน้าหลัก", icon: "⌂" },
    { href: "/documents", label: "เอกสาร", icon: "▤" },
  ];
  if (can(u, "team") || u.isSupervisor || pending[0].n > 0) items.push({ href: "/team", label: "ทีม", icon: "◎", badge: pending[0].n });
  if (can(u, "employees")) items.push({ href: "/employees", label: "พนักงาน", icon: "☺" });
  if (can(u, "payroll")) items.push({ href: "/payroll", label: "เงินเดือน", icon: "฿" });
  items.push({ href: "/learn", label: "เรียนรู้", icon: "✎" });
  if (can(u, "dashboard") || can(u, "reports")) items.push({ href: "/reports", label: "รายงาน", icon: "▥" });
  if (["settings.org", "settings.time", "settings.payroll", "settings.system"].some((k) => can(u, k)))
    items.push({ href: "/settings", label: "ตั้งค่า", icon: "⚙" });

  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">Mine Works HR</div>
        <div className="company">{company[0]?.name_th}</div>
        <Nav items={items} />
        <div className="who">
          <div>
            <Link href="/me" style={{ color: "#fff", padding: 0 }}>
              {u.first_name} {u.last_name}
            </Link>
          </div>
          <div style={{ opacity: 0.7 }}>{u.position_name || u.roles.map((r) => r.name).join(", ")}</div>
          <form action={logout}>
            <button type="submit">ออกจากระบบ</button>
          </form>
        </div>
      </aside>
      <main className="main">
        <div className="topbar noprint">
          <Link href="/notifications" className="bell" title="การแจ้งเตือน">
            🔔{unread[0].n ? <b>{unread[0].n}</b> : null}
          </Link>
          <Link href="/me">บัญชีของฉัน</Link>
        </div>
        {children}
      </main>
    </div>
  );
}
