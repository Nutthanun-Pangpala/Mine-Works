import { NextRequest } from "next/server";
import { getUser, isHR } from "@/lib/auth";
import { sql } from "@/lib/db";
import { EMP_TYPE, isMonth, monthBkk, ROLE_LABEL, STATUS_LABEL } from "@/lib/util";
import { monthlySummary } from "@/lib/reports";

function cell(v: any): string {
  let s = v == null ? "" : String(v);
  // Stop spreadsheet apps from running a cell as a formula
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(headers: string[], rows: any[][]): string {
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ type: string }> }) {
  const u = await getUser();
  if (!u || !isHR(u)) return new Response("Forbidden", { status: 403 });

  const { type } = await ctx.params;
  const mParam = req.nextUrl.searchParams.get("m");
  const m = isMonth(mParam) ? (mParam as string) : monthBkk();
  let body = "";
  let name = `${type}-${m}`;

  if (type === "employees") {
    name = "employees";
    const rows = await sql()`
      select e.code, e.first_name, e.last_name, e.nickname, e.email, e.phone, e.role, e.employment_type, e.status,
             d.name as dept, p.name as pos, b.name as branch,
             to_char(e.start_date, 'YYYY-MM-DD') as start_date, to_char(e.end_date, 'YYYY-MM-DD') as end_date
      from employees e
      left join departments d on d.id = e.department_id
      left join positions p on p.id = e.position_id
      left join branches b on b.id = e.branch_id
      order by e.code`;
    body = csv(
      ["รหัส", "ชื่อ", "นามสกุล", "ชื่อเล่น", "อีเมล", "โทร", "สิทธิ์", "ประเภทการจ้าง", "สถานะ", "แผนก", "ตำแหน่ง", "สาขา", "วันเริ่มงาน", "วันสิ้นสุด"],
      rows.map((r: any) => [
        r.code, r.first_name, r.last_name, r.nickname, r.email, r.phone, ROLE_LABEL[r.role], EMP_TYPE[r.employment_type],
        r.status === "active" ? "ทำงานอยู่" : "พ้นสภาพ", r.dept, r.pos, r.branch, r.start_date, r.end_date,
      ])
    );
  } else if (type === "attendance") {
    const rows = await sql()`
      select e.code, e.first_name || ' ' || e.last_name as name, to_char(a.work_date, 'YYYY-MM-DD') as day,
             to_char(a.check_in at time zone 'Asia/Bangkok', 'HH24:MI') as cin,
             to_char(a.check_out at time zone 'Asia/Bangkok', 'HH24:MI') as cout,
             a.late_minutes, a.in_distance_m,
             round((extract(epoch from (a.check_out - a.check_in)) / 3600.0)::numeric, 2)::float as hours
      from attendance a join employees e on e.id = a.employee_id
      where to_char(a.work_date, 'YYYY-MM') = ${m}
      order by a.work_date, e.code`;
    body = csv(
      ["รหัส", "ชื่อ", "วันที่", "เข้า", "ออก", "ชั่วโมงทำงาน", "สาย (นาที)", "ระยะห่างจากสาขา (ม.)"],
      rows.map((r: any) => [r.code, r.name, r.day, r.cin, r.cout, r.hours, r.late_minutes, r.in_distance_m])
    );
  } else if (type === "leave") {
    const rows = await sql()`
      select e.code, e.first_name || ' ' || e.last_name as name, lt.name as type,
             to_char(lr.start_date, 'YYYY-MM-DD') as s, to_char(lr.end_date, 'YYYY-MM-DD') as en,
             lr.days::float as days, lr.reason, lr.status
      from leave_requests lr
      join employees e on e.id = lr.employee_id
      join leave_types lt on lt.id = lr.leave_type_id
      where to_char(lr.start_date, 'YYYY-MM') = ${m}
      order by lr.start_date, e.code`;
    body = csv(
      ["รหัส", "ชื่อ", "ประเภท", "ตั้งแต่", "ถึง", "จำนวนวัน", "เหตุผล", "สถานะ"],
      rows.map((r: any) => [r.code, r.name, r.type, r.s, r.en, r.days, r.reason, STATUS_LABEL[r.status]])
    );
  } else if (type === "ot") {
    const rows = await sql()`
      select e.code, e.first_name || ' ' || e.last_name as name, to_char(o.work_date, 'YYYY-MM-DD') as day,
             o.hours::float as hours, o.reason, o.status
      from ot_requests o join employees e on e.id = o.employee_id
      where to_char(o.work_date, 'YYYY-MM') = ${m}
      order by o.work_date, e.code`;
    body = csv(
      ["รหัส", "ชื่อ", "วันที่", "ชั่วโมง", "เหตุผล", "สถานะ"],
      rows.map((r: any) => [r.code, r.name, r.day, r.hours, r.reason, STATUS_LABEL[r.status]])
    );
  } else if (type === "summary") {
    const rows = await monthlySummary(m);
    body = csv(
      ["รหัส", "ชื่อ", "แผนก", "วันมาทำงาน", "สาย (ครั้ง)", "สาย (นาที)", "ลา (วัน)", "OT (ชม.)"],
      rows.map((r: any) => [r.code, r.name, r.dept, r.days_present, r.late_count, r.late_minutes, r.leave_days, r.ot_hours])
    );
  } else {
    return new Response("Not found", { status: 404 });
  }

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
