import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies, levels } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { deleteLevel, deletePosition, saveLevel, savePosition } from "@/app/actions/settings";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";
import ConfirmButton from "@/components/ConfirmButton";

export default async function Positions({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.org");
  const tab = sp.tab === "levels" ? "levels" : "positions";
  const [lv, cos, pos] = await Promise.all([
    levels(),
    companies(),
    sql()`
      select p.*, l.code as level, c.name_th as company,
        (select count(*)::int from employees e where e.position_id = p.id and e.status <> 'terminated') as n
      from positions p left join position_levels l on l.id = p.level_id left join companies c on c.id = p.company_id
      order by l.rank nulls last, p.name`,
  ]);
  const editPos = pos.find((p: any) => p.id === Number(sp.edit));
  const editLv = lv.find((l: any) => l.id === Number(sp.edit));
  return (
    <>
      <Notice sp={sp} />
      <Tabs
        small
        tabs={[
          { href: "/settings/positions", label: "ตำแหน่ง", on: tab === "positions" },
          { href: "/settings/positions?tab=levels", label: "ระดับตำแหน่ง", on: tab === "levels" },
        ]}
      />
      {tab === "positions" ? (
        <>
          <div className="card scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ตำแหน่ง</th>
                  <th>ตำแหน่ง (EN)</th>
                  <th>ระดับ</th>
                  <th>บริษัท</th>
                  <th className="num">พนักงาน / อัตรา</th>
                  <th>สถานะ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pos.map((p: any) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.name_en}</td>
                    <td>{p.level || "-"}</td>
                    <td>{p.company || "ทุกบริษัท"}</td>
                    <td className="num">
                      {p.n}
                      {p.headcount_plan ? ` / ${p.headcount_plan}` : ""}
                    </td>
                    <td>{p.active ? "ใช้งาน" : "ปิด"}</td>
                    <td className="actions">
                      <Link className="btn sm" href={`/settings/positions?edit=${p.id}`}>
                        แก้ไข
                      </Link>
                      <form action={deletePosition}>
                        <input type="hidden" name="id" value={p.id} />
                        <ConfirmButton message="ลบตำแหน่งนี้?">ลบ</ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>{editPos ? "แก้ไขตำแหน่ง" : "เพิ่มตำแหน่ง"}</h2>
            <form action={savePosition} className="fields" key={editPos?.id ?? "new"}>
              {editPos && <input type="hidden" name="id" value={editPos.id} />}
              <label>
                ตำแหน่ง*
                <input name="name" required defaultValue={editPos?.name ?? ""} />
              </label>
              <label>
                ตำแหน่ง (EN)
                <input name="name_en" defaultValue={editPos?.name_en ?? ""} />
              </label>
              <label>
                ระดับ
                <select name="level_id" defaultValue={editPos?.level_id ?? ""}>
                  <Opt list={lv} label={(l: any) => `${l.code} ${l.name !== l.code ? l.name : ""}`} />
                </select>
              </label>
              <label>
                บริษัท
                <select name="company_id" defaultValue={editPos?.company_id ?? ""}>
                  <Opt list={cos} label="name_th" empty="ทุกบริษัท" />
                </select>
              </label>
              <label>
                อัตรากำลัง (คน)
                <input type="number" name="headcount_plan" defaultValue={editPos?.headcount_plan ?? ""} />
              </label>
              <label className="full">
                รายละเอียดงาน
                <textarea name="description" rows={2} defaultValue={editPos?.description ?? ""} />
              </label>
              <label className="check">
                <input type="checkbox" name="active" defaultChecked={editPos ? editPos.active : true} /> ใช้งาน
              </label>
              <button className="btn primary">บันทึก</button>
            </form>
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <p className="muted small">โปรดกำหนดระดับที่สูงที่สุดเป็นลำดับแรก (ลำดับน้อย = ระดับสูง) ใช้ในเวิร์กโฟลว์ “อนุมัติถึงระดับตำแหน่ง” และสิทธิ์การลาตามระดับ</p>
            <table className="tbl">
              <thead>
                <tr>
                  <th>ลำดับ</th>
                  <th>ชื่อระดับ</th>
                  <th>ชื่อระดับ (EN)</th>
                  <th>คำอธิบาย</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lv.map((l: any) => (
                  <tr key={l.id}>
                    <td>{l.rank}</td>
                    <td>{l.code}</td>
                    <td>{l.name}</td>
                    <td>{l.description}</td>
                    <td className="actions">
                      <Link className="btn sm" href={`/settings/positions?tab=levels&edit=${l.id}`}>
                        แก้ไข
                      </Link>
                      <form action={deleteLevel}>
                        <input type="hidden" name="id" value={l.id} />
                        <ConfirmButton message="ลบระดับนี้?">ลบ</ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>{editLv ? "แก้ไขระดับ" : "เพิ่มระดับ"}</h2>
            <form action={saveLevel} className="fields" key={editLv?.id ?? "new"}>
              {editLv && <input type="hidden" name="id" value={editLv.id} />}
              <label>
                รหัสระดับ*
                <input name="code" required defaultValue={editLv?.code ?? ""} />
              </label>
              <label>
                ชื่อระดับ*
                <input name="name" required defaultValue={editLv?.name ?? ""} />
              </label>
              <label>
                ชื่อระดับ (EN)
                <input name="name_en" defaultValue={editLv?.name_en ?? ""} />
              </label>
              <label>
                ลำดับ
                <input type="number" name="rank" defaultValue={editLv?.rank ?? 100} />
              </label>
              <label className="full">
                คำอธิบาย
                <input name="description" defaultValue={editLv?.description ?? ""} />
              </label>
              <button className="btn primary">บันทึก</button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
