import Link from "next/link";
import { loadProfile } from "@/lib/profile";
import { EMP_STATUS, fd, fullName, tenureText } from "@/lib/util";
import ProfileNav from "./ProfileNav";

export default async function ProfileLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { e, seeSalary, hr, canAccount } = await loadProfile(id);
  const initials = (e.nickname || e.first_name || "?").slice(0, 3);
  return (
    <>
      <div className="muted small noprint" style={{ marginBottom: 8 }}>
        {hr ? <Link href="/employees">พนักงาน</Link> : "โปรไฟล์"} / {e.code}
      </div>
      <div className="profile-head">
        {e.photo_file_id ? <img className="avatar" src={`/api/files/${e.photo_file_id}`} alt="" /> : <div className="avatar">{initials}</div>}
        <div>
          <h1 style={{ margin: 0 }}>
            {fullName(e)} {e.nickname ? `(${e.nickname})` : ""}
          </h1>
          <div className="muted">
            {e.position || "-"} {e.level ? `(${e.level})` : ""} · {e.unit || e.company || "-"} · #{e.code}
          </div>
          <div className="muted small">
            {EMP_STATUS[e.status]} · เริ่มงาน {fd(e.sd)} ({e.status === "terminated" ? `พ้นสภาพ ${fd(e.ed)}` : tenureText(e.sd)})
          </div>
        </div>
      </div>
      <div className="layout2">
        <ProfileNav id={e.id} salary={seeSalary} account={canAccount} />
        <div>{children}</div>
      </div>
    </>
  );
}
