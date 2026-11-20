import { notFound, redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { Payslip, loadSlips } from "@/lib/print";

export default async function PayslipPage({ params }: { params: Promise<{ lineId: string }> }) {
  const { lineId } = await params;
  const u = await requireUser();
  const [s] = await loadSlips([Number(lineId)]);
  if (!s) notFound();
  const self = s.employee_id === u.id && ["approved", "closed", "paid"].includes(s.pstatus);
  if (!self && !can(u, "payroll") && !can(u, "employees.salary")) redirect("/?error=forbidden");
  return <Payslip s={s} />;
}
