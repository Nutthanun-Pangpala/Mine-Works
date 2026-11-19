import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isHR, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { EMP_TYPE, ROLE_LABEL } from "@/lib/util";
import Notice from "@/components/Notice";
import EmployeeForm from "@/components/EmployeeForm";

export default async function EmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<any>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const u = await requireUser();
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();

  const rows = await sql()`
    select e.id, e.code, e.email, e.role, e.first_name, e.last_name, e.nickname, e.phone,
           e.department_id, e.position_id, e.branch_id, e.shift_id, e.manager_id, e.employment_type, e.status,
           to_char(e.start_date, 'YYYY-MM-DD') as start_date,
           to_char(e.end_date, 'YYYY-MM-DD') as end_date,
           to_char(e.birth_date, 'YYYY-MM-DD') as birth_date,
           d.name as dept, p.name as pos, b.name as branch, s.name as shift,
           m.first_name || ' ' || m.last_name as manager
    from employees e
    left join departments d on d.id = e.department_id
    left join positions p on p.id = e.position_id
    left join branches b on b.id = e.branch_id
    left join shifts s on s.id = e.shift_id
    left join employees m on m.id = e.manager_id
    where e.id = ${id}`;
  const e = rows[0];
  if (!e) notFound();

  const hr = isHR(u);
  if (!hr && e.id !== u.id && e.manager_id !== u.id) redirect("/employees");
  const canEdit = hr && (e.role !== "admin" || u.role === "admin");

  return (
    <>
      <div className="head">
        <div>
          <h1>
            {e.first_name} {e.last_name}
          </h1>
          <div className="muted">
            {e.code} · {e.pos || "ไม่ระบุตำแหน่ง"}
          </div>
        </div>
        <Link className="btn" href="/employees">
          กลับ
        </Link>
      </div>
      <Notice sp={sp} />
      {canEdit ? (
        <section className="card">
          <h2>แก้ไขข้อมูล</h2>
          <EmployeeForm emp={e} viewer={u} />
        </section>
      ) : (
        <section className="card">
          <dl className="info">
            <dt>อีเมล</dt>
            <dd>{e.email}</dd>
            <dt>เบอร์โทร</dt>
            <dd>{e.phone || "–"}</dd>
            <dt>ชื่อเล่น</dt>
            <dd>{e.nickname || "–"}</dd>
            <dt>สิทธิ์</dt>
            <dd>{ROLE_LABEL[e.role]}</dd>
            <dt>แผนก</dt>
            <dd>{e.dept || "–"}</dd>
            <dt>ตำแหน่ง</dt>
            <dd>{e.pos || "–"}</dd>
            <dt>สาขา</dt>
            <dd>{e.branch || "–"}</dd>
            <dt>กะ</dt>
            <dd>{e.shift || "–"}</dd>
            <dt>หัวหน้า</dt>
            <dd>{e.manager || "–"}</dd>
            <dt>ประเภทการจ้าง</dt>
            <dd>{EMP_TYPE[e.employment_type]}</dd>
            <dt>วันเริ่มงาน</dt>
            <dd>{e.start_date || "–"}</dd>
          </dl>
        </section>
      )}
    </>
  );
}
