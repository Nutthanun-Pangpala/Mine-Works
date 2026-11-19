import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies } from "@/lib/lookups";
import { REPORT_GROUPS, readParams, reportByCode, runReport } from "@/lib/reports";
import { PERIOD_STATUS } from "@/lib/util";

const LIMIT = 500;

export default async function ReportView({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<any> }) {
  const { code } = await params;
  const sp = await searchParams;
  const u = await requireUser();
  const def = reportByCode(code);
  if (!def) notFound();
  const p = readParams(sp);
  const [cos, periods] = await Promise.all([
    companies(),
    def.params.includes("period")
      ? sql()`select id, name, status from payroll_periods where status <> 'draft' order by pay_date desc, id desc limit 36`
      : Promise.resolve([]),
  ]);
  const query = { ...sp };
  if (def.params.includes("period") && !query.period && periods[0]) query.period = String(periods[0].id);
  const r = await runReport(u, def.code, query);
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();

  return (
    <>
      <div className="head">
        <div>
          <h1>
            {def.code} {def.name}
          </h1>
          <div className="muted">{REPORT_GROUPS[def.group]}</div>
        </div>
        <Link href={`/reports?group=${def.group}`}>กลับ</Link>
      </div>
      <form className="card inline">
        {def.params.includes("range") && (
          <>
            <label>
              ตั้งแต่
              <input type="date" name="from" defaultValue={p.from} />
            </label>
            <label>
              ถึง
              <input type="date" name="to" defaultValue={p.to} />
            </label>
          </>
        )}
        {def.params.includes("month") && (
          <label>
            เดือน
            <input type="month" name="month" defaultValue={p.month} />
          </label>
        )}
        {def.params.includes("year") && (
          <label>
            ปี (ค.ศ.)
            <input type="number" name="year" min={2000} max={2100} defaultValue={p.year} />
          </label>
        )}
        {def.params.includes("period") && (
          <label>
            งวดเงินเดือน
            <select name="period" defaultValue={query.period ?? ""}>
              {periods.map((x: any) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({PERIOD_STATUS[x.status]})
                </option>
              ))}
            </select>
          </label>
        )}
        {cos.length > 1 && def.code !== "P020" && (
          <label>
            บริษัท
            <select name="company" defaultValue={sp.company ?? ""}>
              <option value="">ทุกบริษัท</option>
              {cos.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name_th}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="btn primary">ดูรายงาน</button>
        {"result" in r && (
          <a className="btn" href={`/api/reports/${def.code}?${qs}`}>
            ดาวน์โหลด CSV
          </a>
        )}
      </form>
      {"error" in r ? (
        <div className="notice err">{r.error}</div>
      ) : (
        <div className="card scroll">
          {r.result.note ? <p className="small muted">{r.result.note}</p> : null}
          <p className="small muted">
            {r.result.rows.length} แถว{r.result.rows.length > LIMIT ? ` (แสดง ${LIMIT} แถวแรก ดาวน์โหลด CSV เพื่อดูทั้งหมด)` : ""}
          </p>
          {r.result.rows.length === 0 ? (
            <div className="empty">ไม่มีข้อมูล</div>
          ) : (
            <table className="tbl compact">
              <thead>
                <tr>
                  {r.result.cols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.result.rows.slice(0, LIMIT).map((row, i) => (
                  <tr key={i}>
                    {row.map((v, j) => (
                      <td key={j} className={typeof v === "number" ? "num" : ""}>
                        {typeof v === "string" && v.startsWith("/print/") ? (
                          <Link href={v} target="_blank">
                            พิมพ์
                          </Link>
                        ) : typeof v === "number" ? (
                          v.toLocaleString("en-US", { maximumFractionDigits: 2 })
                        ) : (
                          v ?? ""
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
