import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies, options } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { saveCourse } from "@/app/actions/learn";
import Notice from "@/components/Notice";

export default async function ManageCourses({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("learn.manage");
  const [list, cats, cos] = await Promise.all([
    sql()`select c.*, mo.name as cat,
            (select count(*)::int from course_enrollments x where x.course_id = c.id) as n,
            (select count(*)::int from course_enrollments x where x.course_id = c.id and x.status = 'completed') as done
          from courses c left join master_options mo on mo.id = c.category_id order by c.created_at desc`,
    options("course_category"),
    companies(),
  ]);
  return (
    <>
      <div className="head">
        <h1>จัดการหลักสูตร</h1>
        <Link href="/learn">กลับ</Link>
      </div>
      <Notice sp={sp} />
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>หลักสูตร</th>
              <th>หมวดหมู่</th>
              <th>สถานะ</th>
              <th className="num">ผู้เรียน</th>
              <th className="num">เรียนจบ</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c: any) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/learn/manage/${c.id}`}>{c.title}</Link>
                </td>
                <td>{c.cat || "-"}</td>
                <td>{c.published ? "เผยแพร่" : "ฉบับร่าง"}</td>
                <td className="num">{c.n}</td>
                <td className="num">{c.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 ? <div className="empty">ยังไม่มีหลักสูตร</div> : null}
      </div>
      <form action={saveCourse} className="card fields">
        <h2 className="full">เพิ่มหลักสูตร</h2>
        <label className="full">
          ชื่อหลักสูตร*
          <input name="title" required />
        </label>
        <label>
          หมวดหมู่
          <select name="category_id">
            <Opt list={cats} />
          </select>
        </label>
        <label>
          ระยะเวลา (นาที)
          <input type="number" name="duration_minutes" min={0} />
        </label>
        <label>
          บริษัท
          <select name="company_id">
            <Opt list={cos} label="name_th" empty="ทุกบริษัท" />
          </select>
        </label>
        <label className="full">
          ลิงก์บทเรียน (วิดีโอ/เอกสาร)
          <input name="url" type="url" placeholder="https://" />
        </label>
        <label className="full">
          รายละเอียด
          <textarea name="description" rows={3} />
        </label>
        <label className="check">
          <input type="checkbox" name="published" /> เผยแพร่ในคลังหลักสูตร
        </label>
        <button className="btn primary">บันทึก</button>
      </form>
    </>
  );
}
