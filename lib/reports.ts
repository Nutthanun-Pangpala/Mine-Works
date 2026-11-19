import { sql } from "./db";

// One row per active employee for month m (YYYY-MM): the inputs payroll will need later.
export async function monthlySummary(m: string): Promise<any[]> {
  return sql()`
    select e.code, e.first_name || ' ' || e.last_name as name, coalesce(d.name, '') as dept,
      (select count(*) from attendance a
        where a.employee_id = e.id and to_char(a.work_date, 'YYYY-MM') = ${m})::int as days_present,
      (select count(*) from attendance a
        where a.employee_id = e.id and to_char(a.work_date, 'YYYY-MM') = ${m} and a.late_minutes > 0)::int as late_count,
      (select coalesce(sum(a.late_minutes), 0) from attendance a
        where a.employee_id = e.id and to_char(a.work_date, 'YYYY-MM') = ${m})::int as late_minutes,
      (select coalesce(sum(lr.days), 0) from leave_requests lr
        where lr.employee_id = e.id and lr.status = 'approved' and to_char(lr.start_date, 'YYYY-MM') = ${m})::float as leave_days,
      (select coalesce(sum(o.hours), 0) from ot_requests o
        where o.employee_id = e.id and o.status = 'approved' and to_char(o.work_date, 'YYYY-MM') = ${m})::float as ot_hours
    from employees e
    left join departments d on d.id = e.department_id
    where e.status = 'active'
    order by e.code`;
}
