import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { deleteOption, saveOption } from "@/app/actions/settings";
import { fdt } from "@/lib/util";
import Notice from "@/components/Notice";
import ConfirmButton from "@/components/ConfirmButton";

const CATS: [string, [string, string, string][]][] = [
  ["ข้อมูลพนักงาน", [
    ["occupation", "อาชีพ", "ตัวเลือกอาชีพของสมาชิกครอบครัวพนักงาน"],
    ["employee_type", "ประเภทพนักงาน", "จำแนกพนักงาน เช่น ประจำ พาร์ตไทม์ ชั่วคราว รายวัน ฝึกงาน"],
    ["work_location", "สถานที่ทำงาน", "จำแนกสถานที่ทำงานในกระบวนการสรรหา"],
    ["title", "คำนำหน้าชื่อ", ""],
    ["nationality", "สัญชาติ", ""],
    ["religion", "ศาสนา", ""],
    ["marital", "สถานภาพสมรส", ""],
    ["military", "สถานภาพเกณฑ์ทหาร", ""],
    ["blood", "หมู่เลือด", ""],
    ["education_level", "ระดับการศึกษา", ""],
    ["relationship", "ความสัมพันธ์", ""],
    ["bank", "ธนาคาร", ""],
  ]],
  ["บริษัท", [
    ["company_rule", "กฎระเบียบบริษัท", "ลักษณะการกระทำที่ฝ่าฝืน ใช้ในการสร้างหนังสือเตือน"],
    ["asset_type", "ประเภททรัพย์สิน", ""],
  ]],
  ["เอกสาร", [
    ["attachment_type", "ประเภทเอกสารแนบ", "ประเภทเอกสารการทำงานและเอกสารทางราชการของพนักงาน"],
    ["ot_reason", "เหตุผลการขอทำงานล่วงเวลา", "ตัวเลือกเหตุผลกรณีสร้างเอกสารขอทำงานล่วงเวลา"],
    ["reject_reason", "เหตุผลการปฏิเสธผู้สมัคร", ""],
    ["separation_reason", "เหตุผลการพ้นสภาพ", "ตัวเลือกเหตุผลในขั้นตอนการดำเนินการพ้นสภาพ"],
    ["resign_reason", "เหตุผลการลาออก", "ตัวเลือกเหตุผลกรณีพนักงานขอลาออก"],
  ]],
  ["การเรียนรู้", [
    ["course_category", "หมวดหมู่หลักสูตร", ""],
    ["skill_set", "ชุดทักษะ", ""],
  ]],
  ["Engagement", [["achievement_category", "หมวดหมู่ความสำเร็จ", ""]]],
];

export default async function Master({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.org");
  const all = CATS.flatMap(([, items]) => items);
  const cat = all.find(([k]) => k === sp.cat) || all[0];
  const rows = await sql()`
    select m.*, u.first_name as uf from master_options m left join employees u on u.id = m.updated_by
    where m.category = ${cat[0]} order by m.sort, m.id`;
  const edit = rows.find((r: any) => r.id === Number(sp.edit));
  return (
    <>
      <Notice sp={sp} />
      <div className="layout2" style={{ gridTemplateColumns: "220px 1fr" }}>
        <nav className="subnav">
          {CATS.map(([g, items]) => (
            <div key={g} style={{ display: "contents" }}>
              <div className="grp">{g}</div>
              {items.map(([k, label]) => (
                <Link key={k} href={`/settings/master?cat=${k}`} className={k === cat[0] ? "on" : ""}>
                  {label}
                </Link>
              ))}
            </div>
          ))}
          <div className="grp">อื่นๆ</div>
          <Link href="/settings/statutory">อัตราสมทบประกันสังคม</Link>
        </nav>
        <div>
          <div className="card">
            <h2>{cat[1]}</h2>
            {cat[2] ? <p className="muted small">{cat[2]}</p> : null}
            <table className="tbl compact">
              <thead>
                <tr>
                  <th>ลำดับ</th>
                  <th>ชื่อตัวเลือก</th>
                  <th>คำอธิบาย</th>
                  <th>แก้ไขล่าสุด</th>
                  <th>สถานะ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.sort}</td>
                    <td>
                      {r.name}
                      {r.name_en ? <div className="small muted">{r.name_en}</div> : null}
                    </td>
                    <td className="wrap">{r.description}</td>
                    <td className="small">
                      {r.uf || "ระบบ"} {fdt(r.updated_at)}
                    </td>
                    <td>{r.active ? "ใช้งาน" : "ปิด"}</td>
                    <td className="actions">
                      <Link className="btn sm" href={`/settings/master?cat=${cat[0]}&edit=${r.id}`}>
                        แก้ไข
                      </Link>
                      <form action={deleteOption}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="category" value={cat[0]} />
                        <ConfirmButton message="ลบตัวเลือกนี้?">ลบ</ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>{edit ? "แก้ไขตัวเลือก" : "เพิ่มตัวเลือก"}</h2>
            <form action={saveOption} className="fields" key={edit?.id ?? "new"}>
              <input type="hidden" name="category" value={cat[0]} />
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <label>
                ชื่อตัวเลือก*
                <input name="name" required defaultValue={edit?.name ?? ""} />
              </label>
              <label>
                ชื่อ (EN)
                <input name="name_en" defaultValue={edit?.name_en ?? ""} />
              </label>
              <label>
                ลำดับ
                <input type="number" name="sort" defaultValue={edit?.sort ?? ""} />
              </label>
              <label className="full">
                คำอธิบาย
                <input name="description" defaultValue={edit?.description ?? ""} />
              </label>
              <label className="check">
                <input type="checkbox" name="active" defaultChecked={edit ? edit.active : true} /> ใช้งาน
              </label>
              <button className="btn primary">บันทึก</button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
