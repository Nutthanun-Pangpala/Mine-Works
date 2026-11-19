import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { login } from "@/app/actions";
import Notice from "@/components/Notice";

export default async function LoginPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  if (await getUser()) redirect("/");
  return (
    <div className="login">
      <div className="card">
        <h1>ระบบ HR</h1>
        <p className="muted">เข้าสู่ระบบด้วยอีเมลพนักงาน</p>
        <Notice sp={sp} />
        <form action={login}>
          <label>
            อีเมล
            <input type="email" name="email" required autoComplete="username" />
          </label>
          <label>
            รหัสผ่าน
            <input type="password" name="password" required autoComplete="current-password" />
          </label>
          <button className="btn primary" type="submit">
            เข้าสู่ระบบ
          </button>
        </form>
      </div>
    </div>
  );
}
