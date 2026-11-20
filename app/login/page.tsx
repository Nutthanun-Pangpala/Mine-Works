import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { schemaState } from "@/lib/migrate";
import { login } from "@/app/actions/auth";
import Notice from "@/components/Notice";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  if ((await schemaState()) !== "ready") redirect("/setup");
  if (await getUser()) redirect("/");
  const n = await sql()`select count(*)::int as n from employees where password_hash is not null and login_enabled`;
  if (n[0].n === 0) redirect("/setup");
  return (
    <div className="login">
      <div className="card">
        <h1>Mine Works HR</h1>
        <p className="muted">เข้าสู่ระบบด้วยอีเมลบริษัทหรือรหัสพนักงาน</p>
        <Notice sp={sp} />
        <form action={login}>
          <label>
            อีเมล / รหัสพนักงาน
            <input name="email" required autoComplete="username" />
          </label>
          <label>
            รหัสผ่าน
            <input type="password" name="password" required autoComplete="current-password" />
          </label>
          <button className="btn primary" type="submit">
            เข้าสู่ระบบ
          </button>
        </form>
        <p className="small muted" style={{ marginTop: 14 }}>
          ลืมรหัสผ่าน? ติดต่อฝ่ายบุคคลเพื่อตั้งรหัสผ่านใหม่ <Link href="/login">ลองอีกครั้ง</Link>
        </p>
      </div>
    </div>
  );
}
