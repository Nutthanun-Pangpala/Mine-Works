import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fullName } from "@/lib/util";
import Tabs from "@/components/Tabs";

type Node = { id: number; parent_id: number | null; name: string; kind: string; head: string | null; n: number; children: Node[] };

const KIND: Record<string, string> = { division: "ฝ่าย", department: "แผนก", section: "ส่วน", unit: "หน่วย" };

function Tree({ nodes }: { nodes: Node[] }) {
  return (
    <ul className="org">
      {nodes.map((n) => (
        <li key={n.id}>
          <span className="org-node">
            <b>{n.name}</b> <span className="muted small" style={{ display: "inline" }}>{KIND[n.kind] || ""}</span>
            <span className="small muted">
              {n.head ? `หัวหน้า: ${n.head} · ` : ""}
              {n.n} คน
            </span>
          </span>
          {n.children.length > 0 && <Tree nodes={n.children} />}
        </li>
      ))}
    </ul>
  );
}

export default async function OrgChart({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requireUser();
  const view = sp.view === "people" ? "people" : "units";
  const [cos, units, people] = await Promise.all([
    sql()`select id, name_th from companies where active order by id`,
    sql()`
      select u.id, u.parent_id, u.company_id, u.name, u.kind, h.title, h.first_name, h.last_name,
             (select count(*)::int from employees e where e.org_unit_id = u.id and e.status in ('probation','confirmed')) as n
      from org_units u left join employees h on h.id = u.head_employee_id where u.active order by u.sort, u.name`,
    view === "people"
      ? sql()`select e.id, e.supervisor_id, e.title, e.first_name, e.last_name, p.name as position from employees e
              left join positions p on p.id = e.position_id where e.status in ('probation','confirmed') order by e.code`
      : Promise.resolve([]),
  ]);
  const build = (companyId: number) => {
    const map = new Map<number, Node>();
    for (const u of units.filter((x: any) => x.company_id === companyId))
      map.set(u.id, { id: u.id, parent_id: u.parent_id, name: u.name, kind: u.kind, head: u.first_name ? fullName(u) : null, n: u.n, children: [] });
    const roots: Node[] = [];
    for (const n of map.values()) {
      const p = n.parent_id ? map.get(n.parent_id) : null;
      if (p) p.children.push(n);
      else roots.push(n);
    }
    return roots;
  };
  const byBoss = new Map<number | null, any[]>();
  for (const p of people) {
    const k = people.some((x: any) => x.id === p.supervisor_id) ? p.supervisor_id : null;
    byBoss.set(k, [...(byBoss.get(k) || []), p]);
  }
  const People = ({ boss }: { boss: number | null }) => (
    <ul className="org">
      {(byBoss.get(boss) || []).map((p: any) => (
        <li key={p.id}>
          <span className="org-node">
            <Link href={`/employees/${p.id}`}>{fullName(p)}</Link>
            <span className="small muted">{p.position || ""}</span>
          </span>
          {byBoss.has(p.id) && <People boss={p.id} />}
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <div className="head">
        <h1>แผนผังองค์กร</h1>
      </div>
      <Tabs
        tabs={[
          { href: "/reports/orgchart", label: "ตามโครงสร้างหน่วยงาน", on: view === "units" },
          { href: "/reports/orgchart?view=people", label: "ตามสายบังคับบัญชา", on: view === "people" },
        ]}
      />
      {view === "units" ? (
        cos.map((c: any) => (
          <div className="card" key={c.id}>
            <h2>{c.name_th}</h2>
            {build(c.id).length ? <Tree nodes={build(c.id)} /> : <div className="empty">ยังไม่มีหน่วยงาน</div>}
          </div>
        ))
      ) : (
        <div className="card scroll">{people.length ? <People boss={null} /> : <div className="empty">ไม่มีข้อมูล</div>}</div>
      )}
    </>
  );
}
