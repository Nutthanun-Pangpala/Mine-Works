import { can, getUser } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { sql } from "@/lib/db";
import { runReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

const TAX_COND: Record<string, number> = { withhold: 1, company_always: 2, company_once: 3 };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  const u = await getUser();
  if (!u || !can(u, "payroll")) return new Response("forbidden", { status: 403 });
  const p = (await sql()`select p.*, p.pay_date::text as pd from payroll_periods p where p.id = ${Number(id)}`)[0];
  if (!p) return new Response("not found", { status: 404 });
  const base = `${p.name}`.replace(/[\\/:*?"<>|]/g, "-");

  if (kind === "bank" || kind === "sso") {
    const r = await runReport(u, kind === "bank" ? "P011" : "SS001", { period: p.id });
    if ("error" in r) return new Response(r.error, { status: 403 });
    if (kind === "bank") {
      // Bank upload file: only employees paid by transfer.
      const rows = r.result.rows.filter((x) => x[3] === "โอนธนาคาร");
      return csvResponse(`โอนเงินเดือน_${base}.csv`, [["ลำดับ", "รหัส", "ชื่อ-สกุล", "ธนาคาร", "เลขที่บัญชี", "จำนวนเงิน", "วันที่โอน"],
        ...rows.map((x, i) => [i + 1, x[1], x[2], x[4], x[5], x[6], p.pd])]);
    }
    return csvResponse(`ประกันสังคม_สปส1-10_${base}.csv`, [r.result.cols, ...r.result.rows]);
  }

  if (kind === "pnd1") {
    const rows = await sql()`
      select e.national_id, e.title, e.first_name, e.last_name, e.tax_method, l.taxable, l.tax
      from payroll_lines l join employees e on e.id = l.employee_id where l.period_id = ${p.id} and (l.taxable > 0 or l.tax > 0) order by e.code`;
    return csvResponse(`ภงด1_${base}.csv`, [
      ["ลำดับ", "เลขประจำตัวผู้เสียภาษี", "คำนำหน้า", "ชื่อ", "นามสกุล", "วันที่จ่าย", "ประเภทเงินได้", "จำนวนเงินที่จ่าย", "ภาษีที่หัก", "เงื่อนไข"],
      ...rows.map((r: any, i: number) => [i + 1, r.national_id, r.title, r.first_name, r.last_name, p.pd, "40(1)", r.taxable, r.tax, TAX_COND[r.tax_method] || 1]),
    ]);
  }

  if (kind === "summary") {
    const [lines, items] = await Promise.all([
      sql()`select l.*, e.code, e.title, e.first_name, e.last_name, ou.name as unit from payroll_lines l join employees e on e.id = l.employee_id
            left join org_units ou on ou.id = e.org_unit_id where l.period_id = ${p.id} order by e.code`,
      sql()`select li.line_id, li.amount, i.id, i.code, i.name, i.kind, i.sort from payroll_line_items li join pay_items i on i.id = li.pay_item_id
            join payroll_lines l on l.id = li.line_id where l.period_id = ${p.id}`,
    ]);
    const cols = new Map<number, any>();
    for (const it of items) cols.set(it.id, it);
    const order = [...cols.values()].sort((a, b) => (a.kind === b.kind ? a.sort - b.sort || a.code.localeCompare(b.code) : a.kind === "income" ? -1 : 1));
    const header = ["รหัส", "ชื่อ-สกุล", "หน่วยงาน", ...order.map((c) => `${c.code} ${c.name}`), "รวมรายได้", "รวมรายหัก", "สุทธิ", "ปกส.นายจ้าง", "PF นายจ้าง", "กองทุนสงเคราะห์ฯ นายจ้าง"];
    const body = lines.map((l: any) => {
      const mine = items.filter((i: any) => i.line_id === l.id);
      return [l.code, `${l.title || ""}${l.first_name} ${l.last_name}`, l.unit,
        ...order.map((c) => mine.filter((m: any) => m.id === c.id).reduce((a: number, m: any) => a + Number(m.amount), 0) || ""),
        l.gross, l.deductions, l.net, l.sso_employer, l.pf_employer, l.ewf_employer];
    });
    return csvResponse(`สรุปเงินเดือน_${base}.csv`, [header, ...body]);
  }
  return new Response("unknown export", { status: 404 });
}
