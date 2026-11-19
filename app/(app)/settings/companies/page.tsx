import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { saveCompany } from "@/app/actions/settings";
import Notice from "@/components/Notice";

export default async function Companies({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.org");
  const rows = await sql()`
    select c.*, (select count(*)::int from employees e where e.company_id = c.id and e.status <> 'terminated') as n
    from companies c order by c.id`;
  return (
    <>
      <Notice sp={sp} />
      <div className="card">
        <h2>บริษัท</h2>
        <table className="tbl">
          <tbody>
            {rows.map((c: any) => (
              <tr key={c.id}>
                <td>{c.code}</td>
                <td>
                  <Link href={`/settings/companies/${c.id}`}>{c.name_th}</Link>
                  <div className="small muted">{c.name_en}</div>
                </td>
                <td>{c.tax_id || "-"}</td>
                <td>{c.n} คน</td>
                <td>{c.active ? "ใช้งาน" : "ปิดใช้งาน"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>เพิ่มบริษัทใหม่</h2>
        <form action={saveCompany} className="fields">
          <label>
            รหัสบริษัท*
            <input name="code" required />
          </label>
          <label>
            ชื่อบริษัท*
            <input name="name_th" required />
          </label>
          <label>
            ชื่อบริษัท (EN)
            <input name="name_en" />
          </label>
          <label>
            เลขประจำตัวผู้เสียภาษี
            <input name="tax_id" />
          </label>
          <button className="btn primary">เพิ่มบริษัท</button>
        </form>
      </div>
    </>
  );
}
