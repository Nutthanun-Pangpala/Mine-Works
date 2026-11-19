import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/util";
import { changePassword } from "@/app/actions";
import Notice from "@/components/Notice";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  return (
    <>
      <div className="head">
        <h1>บัญชีของฉัน</h1>
      </div>
      <Notice sp={sp} />
      <div className="cols">
        <section className="card">
          <dl className="info">
            <dt>ชื่อ</dt>
            <dd>
              {u.first_name} {u.last_name}
            </dd>
            <dt>รหัสพนักงาน</dt>
            <dd>{u.code}</dd>
            <dt>อีเมล</dt>
            <dd>{u.email}</dd>
            <dt>สิทธิ์</dt>
            <dd>{ROLE_LABEL[u.role]}</dd>
          </dl>
          <p>
            <Link href={`/employees/${u.id}`}>ดูข้อมูลพนักงานของฉัน</Link>
          </p>
        </section>
        <section className="card">
          <h2>เปลี่ยนรหัสผ่าน</h2>
          <form action={changePassword} style={{ display: "grid", gap: 12 }}>
            <label>
              รหัสผ่านปัจจุบัน
              <input type="password" name="current" required autoComplete="current-password" />
            </label>
            <label>
              รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)
              <input type="password" name="next" required minLength={8} autoComplete="new-password" />
            </label>
            <div>
              <button className="btn primary" type="submit">
                เปลี่ยนรหัสผ่าน
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
