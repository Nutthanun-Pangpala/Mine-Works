"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { int, ints, num, str, bool } from "@/lib/form";
import { back } from "@/lib/nav";
import { audit, notify } from "@/lib/log";

async function manager(ret: string, act: "create" | "edit" | "delete" = "edit") {
  const u = await requireUser();
  if (!can(u, "learn.manage", act)) back(ret, { error: "forbidden" });
  return u;
}

export async function saveCourse(fd: FormData) {
  const id = int(fd, "id");
  const ret = id ? `/learn/manage/${id}` : "/learn/manage";
  const u = await manager(ret, id ? "edit" : "create");
  const title = str(fd, "title");
  if (!title) back(ret, { error: "required" });
  const vals = {
    category_id: int(fd, "category_id"),
    description: str(fd, "description"),
    url: str(fd, "url"),
    duration: int(fd, "duration_minutes"),
    company_id: int(fd, "company_id"),
    published: bool(fd, "published"),
  };
  if (id) {
    await sql()`update courses set title = ${title}, category_id = ${vals.category_id}, description = ${vals.description}, url = ${vals.url},
                duration_minutes = ${vals.duration}, company_id = ${vals.company_id}, published = ${vals.published} where id = ${id}`;
    back(ret);
  }
  const ins = await sql()`insert into courses (title, category_id, description, url, duration_minutes, company_id, published, created_by)
                          values (${title}, ${vals.category_id}, ${vals.description}, ${vals.url}, ${vals.duration}, ${vals.company_id}, ${vals.published}, ${u.id})
                          returning id`;
  await audit(u.id, "create", "course", ins[0].id);
  redirect(`/learn/manage/${ins[0].id}?ok=1`);
}

export async function deleteCourse(fd: FormData) {
  const id = int(fd, "id")!;
  const u = await manager(`/learn/manage/${id}`, "delete");
  await sql()`delete from courses where id = ${id}`;
  await audit(u.id, "delete", "course", id);
  redirect("/learn/manage?ok=1");
}

export async function assignCourse(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/learn/manage/${id}`;
  await manager(ret);
  let emp = ints(fd, "employee_ids");
  const unit = int(fd, "unit_id");
  const level = int(fd, "level_id");
  if (unit || level) {
    const more = await sql()`
      select e.id from employees e left join positions p on p.id = e.position_id
      where e.status in ('probation','confirmed') and (${unit}::int is null or e.org_unit_id = ${unit}) and (${level}::int is null or p.level_id = ${level})`;
    emp = [...new Set([...emp, ...more.map((r: any) => r.id)])];
  }
  if (!emp.length) back(ret, { error: "required" });
  const c = (await sql()`select title from courses where id = ${id}`)[0];
  const added = await sql()`
    insert into course_enrollments (course_id, employee_id) select ${id}, x from unnest(${emp}::int[]) x
    on conflict do nothing returning employee_id`;
  await notify(added.map((r: any) => r.employee_id), `คุณได้รับมอบหมายหลักสูตร "${c?.title}"`, null, "/learn");
  back(ret, { ok: `มอบหมายแล้ว ${added.length} คน` });
}

export async function enrollSelf(fd: FormData) {
  const u = await requireUser();
  const id = int(fd, "id")!;
  const c = (await sql()`select id from courses where id = ${id} and published`)[0];
  if (!c) back("/learn?tab=catalog", { error: "invalid" });
  await sql()`insert into course_enrollments (course_id, employee_id, status) values (${id}, ${u.id}, 'in_progress') on conflict do nothing`;
  back("/learn");
}

export async function updateMyEnrollment(fd: FormData) {
  const u = await requireUser();
  const id = int(fd, "id")!;
  const status = str(fd, "status");
  if (!["in_progress", "completed"].includes(status || "")) back("/learn", { error: "invalid" });
  await sql()`update course_enrollments set status = ${status}, completed_at = ${status === "completed" ? new Date().toISOString() : null}
              where course_id = ${id} and employee_id = ${u.id}`;
  back("/learn");
}

export async function updateEnrollment(fd: FormData) {
  const id = int(fd, "id")!;
  const ret = `/learn/manage/${id}`;
  await manager(ret);
  const emp = int(fd, "employee_id");
  if (str(fd, "remove")) {
    await sql()`delete from course_enrollments where course_id = ${id} and employee_id = ${emp}`;
    back(ret);
  }
  const status = str(fd, "status") || "assigned";
  await sql()`update course_enrollments set status = ${status}, score = ${num(fd, "score")},
              completed_at = case when ${status} = 'completed' then coalesce(completed_at, now()) else null end
              where course_id = ${id} and employee_id = ${emp}`;
  back(ret);
}
