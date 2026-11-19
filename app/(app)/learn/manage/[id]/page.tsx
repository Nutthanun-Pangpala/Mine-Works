import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies, employeesBrief, levels, options, units } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { assignCourse, deleteCourse, saveCourse, updateEnrollment } from "@/app/actions/learn";
import { fdBkk, fullName } from "@/lib/util";
import Notice from "@/components/Notice";
import ConfirmButton from "@/components/ConfirmButton";

export default async function CourseAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requirePerm("learn.manage");
  const c = (await sql()`select * from courses where id = ${Number(id)}`)[0];
  if (!c) notFound();
  const [cats, cos, emps, us, lv, en] = await Promise.all([
    options("course_category"),
    companies(),
    employeesBrief(),
    units(),
    levels(),
    sql()`select en.*, e.code, e.title, e.first_name, e.last_name, ou.name as unit from course_enrollments en join employees e on e.id = en.employee_id
          left join org_units ou on ou.id = e.org_unit_id where en.course_id = ${c.id} order by e.code`,
  ]);
  return (
    <>
      <div className="head">
        <h1>{c.title}</h1>
        <Link href="/learn/manage">กลับ</Link>
      </div>
      <Notice sp={sp} />
      <div className="cols">
        <form action={saveCourse} className="card fields">
          <input type="hidden" name="id" value={c.id} />
          <h2 className="full">ข้อมูลหลักสูตร</h2>
          <label className="full">
            ชื่อหลักสูตร*
            <input name="title" required defaultValue={c.title} />
          </label>
          <label>
            หมวดหมู่
            <select name="category_id" defaultValue={c.category_id ?? ""}>
              <Opt list={cats} />
            </select>
          </label>
          <label>
            ระยะเวลา (นาที)
            <input type="number" name="duration_minutes" min={0} defaultValue={c.duration_minutes ?? ""} />
          </label>
          <label>
            บริษัท
            <select name="company_id" defaultValue={c.company_id ?? ""}>
              <Opt list={cos} label="name_th" empty="ทุกบริษัท" />
            </select>
          </label>
          <label className="full">
            ลิงก์บทเรียน
            <input name="url" type="url" defaultValue={c.url ?? ""} />
          </label>
          <label className="full">
            รายละเอียด
            <textarea name="description" rows={3} defaultValue={c.description ?? ""} />
          </label>
          <label className="check">
            <input type="checkbox" name="published" defaultChecked={c.published} /> เผยแพร่ในคลังหลักสูตร
          </label>
          <button className="btn primary">บันทึก</button>
        </form>
        <form action={assignCourse} className="card fields">
          <input type="hidden" name="id" value={c.id} />
          <h2 className="full">มอบหมายผู้เรียน</h2>
          <label className="full">
            เลือกพนักงาน (กด Ctrl/⌘ เพื่อเลือกหลายคน)
            <select name="employee_ids" multiple size={8}>
              {emps.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.code} {fullName(e)}
                </option>
              ))}
            </select>
          </label>
          <label>
            หรือทั้งหน่วยงาน
            <select name="unit_id">
              <Opt list={us} label={(x: any) => x.path || x.name} empty="-" />
            </select>
          </label>
          <label>
            หรือทั้งระดับตำแหน่ง
            <select name="level_id">
              <Opt list={lv} empty="-" />
            </select>
          </label>
          <button className="btn primary">มอบหมาย</button>
        </form>
      </div>
      <div className="card scroll">
        <h2>ผู้เรียน ({en.length})</h2>
        <table className="tbl compact">
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ชื่อ-สกุล</th>
              <th>หน่วยงาน</th>
              <th>สถานะ / คะแนน</th>
              <th>เรียนจบเมื่อ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {en.map((r: any) => (
              <tr key={r.employee_id}>
                <td>{r.code}</td>
                <td>{fullName(r)}</td>
                <td>{r.unit || "-"}</td>
                <td>
                  <form action={updateEnrollment} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="employee_id" value={r.employee_id} />
                    <select name="status" defaultValue={r.status}>
                      <option value="assigned">ยังไม่เริ่ม</option>
                      <option value="in_progress">กำลังเรียน</option>
                      <option value="completed">เรียนจบ</option>
                    </select>
                    <input type="number" name="score" step="0.01" style={{ width: 80 }} defaultValue={r.score ?? ""} placeholder="คะแนน" />
                    <button className="btn sm">บันทึก</button>
                  </form>
                </td>
                <td>{r.completed_at ? fdBkk(r.completed_at) : "-"}</td>
                <td>
                  <form action={updateEnrollment}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="employee_id" value={r.employee_id} />
                    <ConfirmButton message="นำผู้เรียนออกจากหลักสูตร?" name="remove" value="1">
                      นำออก
                    </ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={deleteCourse}>
        <input type="hidden" name="id" value={c.id} />
        <ConfirmButton message="ลบหลักสูตรนี้และข้อมูลผู้เรียนทั้งหมด?" className="btn danger">
          ลบหลักสูตร
        </ConfirmButton>
      </form>
    </>
  );
}
