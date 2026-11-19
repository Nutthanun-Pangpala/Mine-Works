import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Payslip, loadSlips } from "@/lib/print";

export default async function PayslipsPage({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params;
  await requirePerm("payroll");
  const ids = await sql()`select id from payroll_lines where period_id = ${Number(periodId)}`;
  const slips = await loadSlips(ids.map((r: any) => r.id));
  if (!slips.length) return <div className="paper">ยังไม่มีข้อมูลสลิปในงวดนี้</div>;
  return (
    <>
      {slips.map((s: any) => (
        <Payslip key={s.id} s={s} />
      ))}
    </>
  );
}
