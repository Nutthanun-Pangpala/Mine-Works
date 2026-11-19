import { isHR, requireUser } from "@/lib/auth";
import { logout } from "@/app/actions";
import { ROLE_LABEL } from "@/lib/util";
import Nav from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const items = [
    { href: "/", label: "ภาพรวม" },
    { href: "/attendance", label: "ลงเวลา" },
    { href: "/leave", label: "การลา" },
    { href: "/ot", label: "ล่วงเวลา (OT)" },
    { href: "/employees", label: "พนักงาน" },
    { href: "/holidays", label: "วันหยุด" },
  ];
  if (isHR(u)) {
    items.push({ href: "/org", label: "โครงสร้างองค์กร" });
    items.push({ href: "/reports", label: "รายงาน" });
  }
  items.push({ href: "/profile", label: "บัญชีของฉัน" });

  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">HR</div>
        <Nav items={items} />
        <div className="who">
          <div>
            {u.first_name} {u.last_name}
          </div>
          <div style={{ opacity: 0.7 }}>{ROLE_LABEL[u.role]}</div>
          <form action={logout}>
            <button type="submit">ออกจากระบบ</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
