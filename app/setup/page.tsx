import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { setupFirstAdmin } from "@/app/actions/auth";
import Notice from "@/components/Notice";

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const n = await sql()`select count(*)::int as n from employees`;
  if (n[0].n > 0) redirect("/login");
  return (
    <div className="login">
      <div className="card">
        <h1>เริ่มต้นใช้งาน</h1>
        <p className="muted">สร้างบัญชีผู้ดูแลระบบคนแรก (Administrator)</p>
        <Notice sp={sp} />
        <form action={setupFirstAdmin}>
          <label>
            ชื่อบริษัท
            <input name="company" placeholder="บริษัทของฉัน" />
          </label>
          <label>
            ชื่อ*
            <input name="first_name" required />
          </label>
          <label>
            นามสกุล*
            <input name="last_name" required />
          </label>
          <label>
            อีเมลบริษัท (ใช้เข้าสู่ระบบ)*
            <input type="email" name="email" required />
          </label>
          <label>
            รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)*
            <input type="password" name="password" required minLength={8} />
          </label>
          <button className="btn primary" type="submit">
            สร้างบัญชีและเริ่มใช้งาน
          </button>
        </form>
      </div>
    </div>
  );
}
