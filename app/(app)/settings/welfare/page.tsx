import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { payItems } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { saveWelfare } from "@/app/actions/settings";
import { money } from "@/lib/util";
import Notice from "@/components/Notice";

export default async function Welfare({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.payroll");
  const [rows, items] = await Promise.all([
    sql()`select w.*, p.name as item from welfare_types w left join pay_items p on p.id = w.pay_item_id order by w.id`,
    payItems(),
  ]);
  const edit = rows.find((r: any) => r.id === Number(sp.edit));
  return (
    <>
      <Notice sp={sp} />
      <div className="card">
        <h2>สวัสดิการ</h2>
        <p className="muted small">พนักงานยื่นเบิกได้ที่ เอกสาร → เบิกสวัสดิการ เมื่ออนุมัติแล้วจะจ่ายพร้อมงวดเงินเดือนที่ครอบคลุมวันที่ใบเสร็จ</p>
        <table className="tbl">
          <tbody>
            {rows.map((w: any) => (
              <tr key={w.id}>
                <td>
                  {w.name}
                  <div className="small muted">{w.description}</div>
                </td>
                <td>{w.budget_per_year ? `${money(w.budget_per_year)} บาท/ปี` : "ไม่จำกัดวงเงิน"}</td>
                <td>{w.item || "-"}</td>
                <td>{w.after_probation ? "หลังผ่านทดลองงาน" : "ทุกคน"}</td>
                <td>{w.active ? "ใช้งาน" : "ปิด"}</td>
                <td>
                  <Link className="btn sm" href={`/settings/welfare?edit=${w.id}`}>
                    แก้ไข
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>{edit ? "แก้ไขสวัสดิการ" : "เพิ่มสวัสดิการ"}</h2>
        <form action={saveWelfare} className="fields" key={edit?.id ?? "new"}>
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <label>
            ชื่อสวัสดิการ*
            <input name="name" required defaultValue={edit?.name ?? ""} />
          </label>
          <label>
            วงเงินต่อปี (บาท)
            <input type="number" step="0.01" name="budget_per_year" defaultValue={edit?.budget_per_year ?? ""} />
          </label>
          <label>
            จ่ายเป็นรายการ
            <select name="pay_item_id" defaultValue={edit?.pay_item_id ?? ""}>
              <Opt list={items.filter((p: any) => p.kind === "income")} label={(p: any) => `${p.code} ${p.name}`} />
            </select>
          </label>
          <label className="full">
            รายละเอียด
            <input name="description" defaultValue={edit?.description ?? ""} />
          </label>
          <label className="check">
            <input type="checkbox" name="after_probation" defaultChecked={!!edit?.after_probation} /> ต้องผ่านทดลองงาน
          </label>
          {edit && (
            <label className="check">
              <input type="checkbox" name="active" defaultChecked={edit.active} /> ใช้งาน
            </label>
          )}
          <button className="btn primary">บันทึก</button>
        </form>
      </div>
    </>
  );
}
