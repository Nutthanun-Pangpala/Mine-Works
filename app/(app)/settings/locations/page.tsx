import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { deleteLocation, saveLocation } from "@/app/actions/settings";
import Notice from "@/components/Notice";
import ConfirmButton from "@/components/ConfirmButton";

const MODES: Record<string, string> = {
  gps: "ลงเวลาด้วย GPS ภายในรัศมี",
  anywhere: "ลงเวลาได้ทุกที่",
  wfh_doc: "ทำงานที่บ้าน (ขอเอกสารเท่านั้น)",
  wfh_both: "ทำงานที่บ้าน (ขอเอกสารพร้อมลงเวลา)",
  wfh_clock: "ทำงานที่บ้าน (ลงเวลาเท่านั้น)",
};

export default async function Locations({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.time");
  const [rows, cos] = await Promise.all([
    sql()`select w.*, c.name_th as company, (select count(*)::int from employee_locations el where el.location_id = w.id) as n
          from work_locations w left join companies c on c.id = w.company_id order by w.id`,
    companies(),
  ]);
  const edit = rows.find((r: any) => r.id === Number(sp.edit));
  return (
    <>
      <Notice sp={sp} />
      <div className="card">
        <h2>สถานที่เวิร์กอิน</h2>
        <table className="tbl">
          <tbody>
            {rows.map((l: any) => (
              <tr key={l.id}>
                <td>
                  {l.name}
                  <div className="small muted">{l.company || "ใช้กับทุกบริษัท"}</div>
                </td>
                <td>{MODES[l.mode]}</td>
                <td>{l.mode === "gps" && l.lat ? `${Number(l.lat).toFixed(5)}, ${Number(l.lng).toFixed(5)} · ${l.radius_m} ม.` : ""}</td>
                <td>{l.n} คน</td>
                <td>{l.active ? "ใช้งาน" : "ปิด"}</td>
                <td className="actions">
                  <Link className="btn sm" href={`/settings/locations?edit=${l.id}`}>
                    แก้ไข
                  </Link>
                  <form action={deleteLocation}>
                    <input type="hidden" name="id" value={l.id} />
                    <ConfirmButton message="ลบสถานที่นี้?">ลบ</ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">กำหนดสถานที่ให้พนักงานแต่ละคนได้ที่ โปรไฟล์ → การจ้างงาน → สถานที่เวิร์กอินที่อนุญาต</p>
      </div>
      <div className="card">
        <h2>{edit ? "แก้ไขสถานที่" : "เพิ่มสถานที่เวิร์กอิน"}</h2>
        <form action={saveLocation} className="fields" key={edit?.id ?? "new"}>
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <label>
            ชื่อสถานที่*
            <input name="name" required defaultValue={edit?.name ?? ""} />
          </label>
          <label>
            รูปแบบ
            <select name="mode" defaultValue={edit?.mode ?? "gps"}>
              {Object.entries(MODES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            บริษัท
            <select name="company_id" defaultValue={edit?.company_id ?? ""}>
              <Opt list={cos} label="name_th" empty="ใช้กับทุกบริษัท" />
            </select>
          </label>
          <label>
            ละติจูด
            <input type="number" step="any" name="lat" defaultValue={edit?.lat ?? ""} />
          </label>
          <label>
            ลองจิจูด
            <input type="number" step="any" name="lng" defaultValue={edit?.lng ?? ""} />
          </label>
          <label>
            รัศมี (เมตร)
            <input type="number" name="radius_m" defaultValue={edit?.radius_m ?? 200} />
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
