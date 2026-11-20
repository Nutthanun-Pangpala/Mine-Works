import Link from "next/link";
import { canPayroll, requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { createPeriods, createSpecialPeriod } from "@/app/actions/payroll";
import { PERIOD_STATUS, addMonths, fd, money, monthBkk, todayBkk } from "@/lib/util";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";
import Badge from "@/components/Badge";

export default async function Payroll({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requirePerm("payroll");
  const tab = sp.tab === "all" ? "all" : "pending";
  const year = Number(sp.year) || Number(todayBkk().slice(0, 4));
  const [periods, cycles, cos] = await Promise.all([
    sql()`
      select p.*, p.start_date::text as sd, p.end_date::text as ed, p.pay_date::text as pd, c.name_th as company,
        (select count(*)::int from payroll_lines l where l.period_id = p.id) as n,
        (select coalesce(sum(net),0) from payroll_lines l where l.period_id = p.id) as net
      from payroll_periods p join companies c on c.id = p.company_id
      where (${tab} = 'pending' and p.status <> 'paid') or (${tab} = 'all' and p.year = ${year})
      order by p.pay_date desc, p.id desc limit 200`,
    sql()`select c.id, co.name_th, et.name from payroll_cycles c join companies co on co.id = c.company_id
          join employment_types et on et.id = c.employment_type_id where c.active order by c.id`,
    companies(),
  ]);
  const canCalc = canPayroll(u, "calculate");
  return (
    <>
      <div className="head">
        <h1>เงินเดือน</h1>
        <Link className="btn" href="/reports?group=payroll">
          รายงานเงินเดือน
        </Link>
      </div>
      <Notice sp={sp} />
      {cycles.length === 0 && (
        <div className="card">
          <h2>เริ่มต้นกำหนดงวดเงินเดือนกัน</h2>
          <p>สร้างรอบการจ่ายเงินเดือน เพื่อเริ่มต้นการทำเงินเดือน</p>
          <Link className="btn primary" href="/settings/payroll-cycles">
            สร้างงวดเงินเดือน
          </Link>
        </div>
      )}
      {canCalc && cycles.length > 0 && (
        <div className="cols">
          <form action={createPeriods} className="card fields">
            <h2 className="full">เปิดงวดเงินเดือน</h2>
            <label>
              งวด / ประเภทการจ้าง
              <select name="cycle_id">
                <Opt list={cycles} label={(c: any) => `${c.name_th} · ${c.name}`} empty={null} />
              </select>
            </label>
            <label>
              เดือน
              <input type="month" name="month" defaultValue={monthBkk()} min={addMonths(monthBkk(), -24)} />
            </label>
            <button className="btn primary">เปิดงวด</button>
          </form>
          <form action={createSpecialPeriod} className="card fields">
            <h2 className="full">งวดพิเศษ (โบนัส / จ่ายนอกรอบ)</h2>
            <label>
              บริษัท
              <select name="company_id">
                <Opt list={cos} label="name_th" empty={null} />
              </select>
            </label>
            <label>
              ชื่องวด
              <input name="name" required placeholder="เช่น โบนัสประจำปี" />
            </label>
            <label>
              วันที่จ่าย
              <input type="date" name="pay_date" required defaultValue={todayBkk()} />
            </label>
            <button className="btn">สร้างงวดพิเศษ</button>
          </form>
        </div>
      )}
      <Tabs
        tabs={[
          { href: "/payroll", label: "งวดที่รอทำเงินเดือน", on: tab === "pending" },
          { href: "/payroll?tab=all", label: "งวดทั้งหมด", on: tab === "all" },
        ]}
      />
      {tab === "all" && (
        <div className="row" style={{ marginBottom: 10 }}>
          <Link className="btn sm" href={`/payroll?tab=all&year=${year - 1}`}>
            ‹ {year + 542}
          </Link>
          <b>ปี {year + 543}</b>
          <Link className="btn sm" href={`/payroll?tab=all&year=${year + 1}`}>
            {year + 544} ›
          </Link>
        </div>
      )}
      <div className="card scroll">
        {periods.length === 0 ? <div className="empty">ไม่มีงวด</div> : null}
        <table className="tbl">
          {periods.length > 0 && (
            <thead>
              <tr>
                <th>งวด</th>
                <th>บริษัท</th>
                <th>ช่วงเวลา</th>
                <th>วันที่จ่าย</th>
                <th className="num">พนักงาน</th>
                <th className="num">ยอดสุทธิ</th>
                <th>สถานะ</th>
              </tr>
            </thead>
          )}
          <tbody>
            {periods.map((p: any) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/payroll/${p.id}`}>{p.name}</Link>
                  {p.is_special ? <span className="badge pending"> พิเศษ</span> : null}
                </td>
                <td>{p.company}</td>
                <td>
                  {fd(p.sd)} – {fd(p.ed)}
                </td>
                <td>{fd(p.pd)}</td>
                <td className="num">{p.n}</td>
                <td className="num">{money(p.net)}</td>
                <td>
                  <Badge status={p.status} label={PERIOD_STATUS[p.status]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
