import { can, requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import SettingsNav from "./SettingsNav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const allow = {
    org: can(u, "settings.org"),
    time: can(u, "settings.time"),
    payroll: can(u, "settings.payroll"),
    system: can(u, "settings.system"),
    announcements: can(u, "announcements"),
    learn: can(u, "learn.manage"),
    audit: can(u, "audit"),
  };
  if (!Object.values(allow).some(Boolean)) redirect("/?error=forbidden");
  return (
    <>
      <div className="head">
        <h1>ตั้งค่า</h1>
      </div>
      <div className="layout2">
        <SettingsNav allow={allow} />
        <div>{children}</div>
      </div>
    </>
  );
}
