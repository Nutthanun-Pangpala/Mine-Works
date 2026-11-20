import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { assignCalendar, copyHolidayYear, deleteHoliday, saveCalendar, saveHoliday } from "@/app/actions/settings";
import { TH_DOW, fd, fullName, thMonth, todayBkk, weekday } from "@/lib/util";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";
import ConfirmButton from "@/components/ConfirmButton";

export default async function Calendars({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.time");
  const [cals, cos, noCal] = await Promise.all([
    sql()`select c.*, (select count(*)::int from employees e where e.calendar_id = c.id and e.status <> 'terminated') as n from holiday_calendars c order by c.id`,
    companies(),
    sql()`select count(*)::int as n from employees where calendar_id is null and status <> 'terminated'`,
  ]);
  const cal = cals.find((c: any) => c.id === Number(sp.cal)) || cals[0];
  const year = Number(sp.year) || Number(todayBkk().slice(0, 4));
  const tab = sp.tab === "employees" ? "employees" : sp.tab === "edit" ? "edit" : "holidays";
  const hol = cal
    ? await sql()`select *, holiday_date::text as d from holidays where calendar_id = ${cal.id} and extract(year from holiday_date) = ${year} order by holiday_date`
    : [];
  const emps = tab === "employees" ? await sql()`select id, code, first_name, last_name, calendar_id from employees where status <> 'terminated' order by code` : [];
  const base = `/settings/calendars?cal=${cal?.id ?? ""}`;
  let lastMonth = 0;
  return (
    <>
      <Notice sp={sp} />
      {noCal[0].n > 0 && <div className="notice">มีพนักงาน {noCal[0].n} คนที่ยังไม่ได้ระบุปฏิทิน (ใช้ปฏิทินตั้งต้น)</div>}
      <div className="row" style={{ marginBottom: 10 }}>
        {cals.map((c: any) => (
          <Link key={c.id} className={c.id === cal?.id ? "btn primary sm" : "btn sm"} href={`/settings/calendars?cal=${c.id}`}>
            {c.name} {c.is_default ? "(ตั้งต้น)" : ""} · {c.n} คน
          </Link>
        ))}
        <Link className="btn sm" href="/settings/calendars?tab=edit&new=1">
          + เพิ่มปฏิทิน
        </Link>
      </div>
      {cal && (
        <Tabs
          small
          tabs={[
            { href: `${base}&year=${year}`, label: "วันหยุด", on: tab === "holidays" },
            { href: `${base}&tab=employees`, label: "พนักงานในปฏิทิน", on: tab === "employees" },
            { href: `${base}&tab=edit`, label: "ตั้งค่าปฏิทิน", on: tab === "edit" && !sp.new },
          ]}
        />
      )}
      {tab === "holidays" && cal && (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <Link className="btn sm" href={`${base}&year=${year - 1}`}>
              ‹ {year + 542}
            </Link>
            <b>ปี {year + 543} · {hol.length} วัน</b>
            <Link className="btn sm" href={`${base}&year=${year + 1}`}>
              {year + 544} ›
            </Link>
            <span className="spacer" />
            <form action={copyHolidayYear}>
              <input type="hidden" name="calendar_id" value={cal.id} />
              <input type="hidden" name="year" value={year} />
              <button className="btn sm">คัดลอกไปปีปฏิทิน {year + 544}</button>
            </form>
          </div>
          <div className="card scroll">
            <table className="tbl compact">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>ชื่อวันหยุด</th>
                  <th>ชื่อวันหยุด (EN)</th>
                  <th>ประเภทวันหยุด</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {hol.map((h: any) => {
                  const m = Number(h.d.slice(5, 7));
                  const head = m !== lastMonth;
                  lastMonth = m;
                  return [
                    head ? (
                      <tr key={"m" + m}>
                        <td colSpan={5}>
                          <b>{thMonth(m)}</b>
                        </td>
                      </tr>
                    ) : null,
                    <tr key={h.id}>
                      <td>
                        {TH_DOW[weekday(h.d)]} {fd(h.d)}
                      </td>
                      <td className="wrap">{h.name}</td>
                      <td className="wrap">{h.name_en}</td>
                      <td>{h.kind === "traditional" ? "วันหยุดตามประเพณี" : "วันหยุดบริษัท"}</td>
                      <td>
                        <form action={deleteHoliday}>
                          <input type="hidden" name="id" value={h.id} />
                          <input type="hidden" name="calendar_id" value={cal.id} />
                          <input type="hidden" name="year" value={year} />
                          <ConfirmButton message="ลบวันหยุดนี้?">ลบ</ConfirmButton>
                        </form>
                      </td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>เพิ่มวันหยุด</h2>
            <form action={saveHoliday} className="fields">
              <input type="hidden" name="calendar_id" value={cal.id} />
              <input type="hidden" name="year" value={year} />
              <label>
                วันที่*
                <input type="date" name="holiday_date" required />
              </label>
              <label>
                ชื่อวันหยุด*
                <input name="name" required />
              </label>
              <label>
                ชื่อวันหยุด (EN)
                <input name="name_en" />
              </label>
              <label>
                ประเภท
                <select name="kind">
                  <option value="traditional">วันหยุดตามประเพณี</option>
                  <option value="company">วันหยุดบริษัท</option>
                </select>
              </label>
              <button className="btn primary">เพิ่มวันหยุด</button>
            </form>
          </div>
        </>
      )}
      {tab === "employees" && cal && (
        <div className="card">
          <form action={assignCalendar}>
            <input type="hidden" name="calendar_id" value={cal.id} />
            <select name="employee_ids" multiple size={14} style={{ width: "100%" }}>
              {emps.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.calendar_id === cal.id ? "✓ " : ""}
                  {e.code} {fullName(e)}
                </option>
              ))}
            </select>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" name="op" value="add">
                เพิ่มพนักงานที่เลือกเข้าปฏิทินนี้
              </button>
              <button className="btn" name="op" value="remove">
                นำออกจากปฏิทินนี้
              </button>
            </div>
          </form>
        </div>
      )}
      {(tab === "edit" || !cal) && (
        <div className="card">
          <h2>{sp.new || !cal ? "เพิ่มปฏิทิน" : "ตั้งค่าปฏิทิน"}</h2>
          <form action={saveCalendar} className="fields" key={sp.new ? "new" : cal?.id}>
            {!sp.new && cal && <input type="hidden" name="id" value={cal.id} />}
            <label>
              ชื่อปฏิทิน*
              <input name="name" required defaultValue={sp.new ? "" : cal?.name ?? ""} />
            </label>
            <label>
              บริษัท
              <select name="company_id" defaultValue={sp.new ? "" : cal?.company_id ?? ""}>
                <Opt list={cos} label="name_th" empty="ทุกบริษัท" />
              </select>
            </label>
            <label className="check">
              <input type="checkbox" name="is_default" defaultChecked={!sp.new && !!cal?.is_default} /> เป็นปฏิทินตั้งต้น
            </label>
            {!sp.new && cal && (
              <label className="check">
                <input type="checkbox" name="active" defaultChecked={cal.active} /> ใช้งาน
              </label>
            )}
            <button className="btn primary">บันทึก</button>
          </form>
        </div>
      )}
    </>
  );
}
