import { redirect } from "next/navigation";
import { isHR, requireUser } from "@/lib/auth";
import Notice from "@/components/Notice";
import EmployeeForm from "@/components/EmployeeForm";

export default async function NewEmployeePage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  if (!isHR(u)) redirect("/employees");
  return (
    <>
      <div className="head">
        <h1>เพิ่มพนักงาน</h1>
      </div>
      <Notice sp={sp} />
      <section className="card">
        <EmployeeForm emp={null} viewer={u} />
      </section>
    </>
  );
}
