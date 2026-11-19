import { requireUser } from "@/lib/auth";
import { quotasFor } from "@/lib/leave";
import { teamMembers } from "@/lib/team";
import { fullName, num } from "@/lib/util";

export default async function TeamQuotas() {
  const u = await requireUser();
  const members = await teamMembers(u);
  const all = await Promise.all(members.map(async (m) => ({ m, q: await quotasFor(m.id) })));
  const types = all[0]?.q.filter((x) => x.entitled !== null) || [];
  return (
    <div className="card scroll">
      <h2>สิทธิ์การลาคงเหลือ (ปีปัจจุบัน)</h2>
      {members.length === 0 ? <div className="empty">ยังไม่มีสมาชิกในทีม</div> : null}
      <table className="tbl compact">
        <thead>
          <tr>
            <th>พนักงาน</th>
            {types.map((t) => (
              <th key={t.type_id} className="num">
                {t.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {all.map(({ m, q }) => (
            <tr key={m.id}>
              <td>{fullName(m)}</td>
              {types.map((t) => {
                const x = q.find((y) => y.type_id === t.type_id);
                return (
                  <td key={t.type_id} className="num">
                    {x ? `${num(x.remaining, 2)} / ${num((x.entitled || 0) + x.carried, 2)}` : "-"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
