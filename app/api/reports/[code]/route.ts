import { getUser } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { readParams, runReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const u = await getUser();
  if (!u) return new Response("unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const r = await runReport(u, code, sp);
  if ("error" in r) return new Response(r.error, { status: 403 });
  const p = readParams(sp);
  const suffix = r.def.params.includes("range") ? `_${p.from}_${p.to}` : r.def.params.includes("month") ? `_${p.month}` : r.def.params.includes("year") ? `_${p.year}` : "";
  return csvResponse(`${r.def.code}_${r.def.name}${suffix}.csv`, [r.result.cols, ...r.result.rows]);
}
