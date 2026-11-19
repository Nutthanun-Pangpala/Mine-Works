import { sql } from "@/lib/db";
import { saveEmployee } from "@/app/actions";
import { EMP_TYPE, ROLE_LABEL } from "@/lib/util";

function Options({ rows, label }: { rows: any[]; label?: (r: any) => string }) {
  return (
    <>
      <option value="">– ไม่ระบุ –</option>
      {rows.map((r) => (
        <option key={r.id} value={r.id}>
          {label ? label(r) : r.name}
        </option>
      ))}
    </>
  );
}

// emp: row with date fields already formatted as YYYY-MM-DD strings, or null for a new employee
export default async function EmployeeForm({ emp, viewer }: { emp: any | null; viewer: any }) {
  const [departments, positions, branches, shifts, managers] = await Promise.all([
    sql()`select id, name from departments order by name`,
    sql()`select id, name from positions order by name`,
    sql()`select id, name from branches order by name`,
    sql()`select id, name from shifts order by name`,
    sql()`select id, code, first_name, last_name from employees where status = 'active' order by code`,
  ]);
  const e = emp || {};
  const roles = Object.keys(ROLE_LABEL).filter((r) => r !== "admin" || viewer.role === "admin");

  return (
    <form action={saveEmployee} className="fields">
      {emp && <input type="hidden" name="id" value={emp.id} />}
      <label>
        รหัสพนักงาน *
        <input name="code" required defaultValue={e.code || ""} />
      </label>
      <label>
        อีเมล (ใช้เข้าสู่ระบบ) *
        <input name="email" type="email" required defaultValue={e.email || ""} />
      </label>
      <label>
        ชื่อ *
        <input name="first_name" required defaultValue={e.first_name || ""} />
      </label>
      <label>
        นามสกุล *
        <input name="last_name" required defaultValue={e.last_name || ""} />
      </label>
      <label>
        ชื่อเล่น
        <input name="nickname" defaultValue={e.nickname || ""} />
      </label>
      <label>
        เบอร์โทร
        <input name="phone" defaultValue={e.phone || ""} />
      </label>
      <label>
        วันเกิด
        <input name="birth_date" type="date" defaultValue={e.birth_date || ""} />
      </label>
      <label>
        สิทธิ์การใช้งาน
        <select name="role" defaultValue={e.role || "employee"}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <label>
        แผนก
        <select name="department_id" defaultValue={e.department_id ?? ""}>
          <Options rows={departments} />
        </select>
      </label>
      <label>
        ตำแหน่ง
        <select name="position_id" defaultValue={e.position_id ?? ""}>
          <Options rows={positions} />
        </select>
      </label>
      <label>
        สาขา
        <select name="branch_id" defaultValue={e.branch_id ?? ""}>
          <Options rows={branches} />
        </select>
      </label>
      <label>
        กะการทำงาน
        <select name="shift_id" defaultValue={e.shift_id ?? ""}>
          <Options rows={shifts} />
        </select>
      </label>
      <label>
        หัวหน้า (ผู้อนุมัติ)
        <select name="manager_id" defaultValue={e.manager_id ?? ""}>
          <Options
            rows={managers.filter((m: any) => m.id !== e.id)}
            label={(m) => `${m.code} ${m.first_name} ${m.last_name}`}
          />
        </select>
      </label>
      <label>
        ประเภทการจ้าง
        <select name="employment_type" defaultValue={e.employment_type || "fulltime"}>
          {Object.keys(EMP_TYPE).map((k) => (
            <option key={k} value={k}>
              {EMP_TYPE[k]}
            </option>
          ))}
        </select>
      </label>
      <label>
        วันเริ่มงาน
        <input name="start_date" type="date" defaultValue={e.start_date || ""} />
      </label>
      <label>
        สถานะ
        <select name="status" defaultValue={e.status || "active"}>
          <option value="active">ทำงานอยู่</option>
          <option value="resigned">พ้นสภาพ</option>
        </select>
      </label>
      <label>
        วันสิ้นสุดการทำงาน
        <input name="end_date" type="date" defaultValue={e.end_date || ""} />
      </label>
      <label>
        {emp ? "ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)" : "รหัสผ่านเริ่มต้น * (อย่างน้อย 8 ตัว)"}
        <input name="password" type="password" minLength={8} required={!emp} autoComplete="new-password" />
      </label>
      <div className="full">
        <button className="btn primary" type="submit">
          บันทึก
        </button>
      </div>
    </form>
  );
}
