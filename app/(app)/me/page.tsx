import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { changePassword } from "@/app/actions/auth";
import Notice from "@/components/Notice";

export default async function Me({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  return (
    <>
      <div className="head">
        <h1>บัญชีของฉัน</h1>
      </div>
      <Notice sp={sp} />
      <div className="cols">
        <div className="card">
          <h2>
            {u.first_name} {u.last_name}
          </h2>
          <dl className="info">
            <dt>รหัสพนักงาน</dt>
            <dd>{u.code}</dd>
            <dt>อีเมล</dt>
            <dd>{u.work_email || "-"}</dd>
            <dt>ตำแหน่ง</dt>
            <dd>{u.position_name || "-"}</dd>
            <dt>บทบาท</dt>
            <dd>{u.roles.map((r) => r.name).join(", ")}</dd>
          </dl>
          <div className="row" style={{ marginTop: 12 }}>
            <Link className="btn" href={`/employees/${u.id}`}>
              ดูโปรไฟล์ของฉัน
            </Link>
            <Link className="btn" href={`/employees/${u.id}/salary?tab=slips`}>
              สลิปเงินเดือน
            </Link>
            <Link className="btn" href={`/employees/${u.id}/time`}>
              ปฏิทินการเข้างาน
            </Link>
          </div>
        </div>
        <div className="card">
          <h2>เปลี่ยนรหัสผ่าน</h2>
          <form action={changePassword} className="fields">
            <label>
              รหัสผ่านปัจจุบัน
              <input type="password" name="current" required autoComplete="current-password" />
            </label>
            <label>
              รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)
              <input type="password" name="next" required minLength={8} autoComplete="new-password" />
            </label>
            <button className="btn primary">บันทึก</button>
          </form>
        </div>
      </div>
    </>
  );
}
