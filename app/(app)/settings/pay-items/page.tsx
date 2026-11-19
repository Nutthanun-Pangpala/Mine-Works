import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { savePayItem } from "@/app/actions/settings";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";

const TAX: Record<string, string> = { annual: "ทั้งปี", once: "ครั้งเดียว", none: "-" };
const WHEN: Record<string, string> = { every: "ทุกงวด", month_end: "งวดสิ้นเดือน" };

export default async function PayItems({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.payroll");
  const kind = sp.kind === "deduction" ? "deduction" : sp.kind === "accounts" ? "accounts" : "income";
  const rows = await sql()`select * from pay_items where ${kind} = 'accounts' or kind = ${kind} order by kind desc, sort, code`;
  const edit = rows.find((r: any) => r.id === Number(sp.edit));
  const b = (k: string, label: string) => (
    <label className="check">
      <input type="checkbox" name={k} defaultChecked={edit ? !!edit[k] : false} /> {label}
    </label>
  );
  return (
    <>
      <Notice sp={sp} />
      <Tabs
        small
        tabs={[
          { href: "/settings/pay-items", label: "รายได้", on: kind === "income" },
          { href: "/settings/pay-items?kind=deduction", label: "รายหัก", on: kind === "deduction" },
          { href: "/settings/pay-items?kind=accounts", label: "ข้อมูลบัญชี", on: kind === "accounts" },
        ]}
      />
      <div className="card scroll">
        <table className="tbl compact">
          <thead>
            <tr>
              <th>รหัส</th>
              <th>{kind === "deduction" ? "รายหัก" : "รายได้"}</th>
              <th>ประเภท</th>
              <th>คำนวณภาษี</th>
              <th>ทำจ่าย</th>
              <th>คำนวณกับ</th>
              <th>รหัสบัญชี</th>
              <th>สถานะ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p: any) => (
              <tr key={p.id}>
                <td>{p.code}</td>
                <td>
                  {p.name}
                  {p.system_key ? <div className="small muted">ระบบ: {p.system_key}</div> : null}
                </td>
                <td>{p.income_type || "-"}</td>
                <td>{TAX[p.tax_mode]}</td>
                <td>{WHEN[p.pay_when]}</td>
                <td className="small">{[p.in_sso && "ประกันสังคม", p.in_pf && "กองทุนสำรองฯ", p.in_ewf && "กสจ.", p.in_ot && "ค่าล่วงเวลา"].filter(Boolean).join(", ")}</td>
                <td>{p.account_code || "-"}</td>
                <td>{p.active ? "ใช้งาน" : "ปิด"}</td>
                <td>
                  <Link className="btn sm" href={`/settings/pay-items?kind=${p.kind}&edit=${p.id}`}>
                    แก้ไข
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {kind !== "accounts" && (
        <div className="card">
          <h2>{edit ? `แก้ไข ${edit.code}` : kind === "income" ? "เพิ่มรายได้" : "เพิ่มรายหัก"}</h2>
          <form action={savePayItem} className="fields" key={edit?.id ?? "new"}>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <input type="hidden" name="kind" value={kind} />
            <label>
              รหัส*
              <input name="code" required defaultValue={edit?.code ?? ""} />
            </label>
            <label>
              ชื่อ*
              <input name="name" required defaultValue={edit?.name ?? ""} />
            </label>
            <label>
              ชื่อ (EN)
              <input name="name_en" defaultValue={edit?.name_en ?? ""} />
            </label>
            <label>
              ประเภทเงินได้
              <select name="income_type" defaultValue={edit?.income_type ?? (kind === "income" ? "40(1)" : "")}>
                <option value="">ไม่ใช่เงินได้ (ไม่มีผลต่อภาษี)</option>
                <option value="40(1)">40 (1) เงินเดือน ค่าจ้าง</option>
                <option value="40(1)(2)">40 (1)(2)</option>
                <option value="40(2)">40 (2)</option>
              </select>
            </label>
            <label>
              การคำนวณภาษี
              <select name="tax_mode" defaultValue={edit?.tax_mode ?? "annual"}>
                <option value="annual">คำนวณทั้งปี (รายได้ประจำ)</option>
                <option value="once">ครั้งเดียว (รายได้ไม่ประจำ)</option>
                <option value="none">ไม่คำนวณ</option>
              </select>
            </label>
            <label>
              ให้ทำจ่าย
              <select name="pay_when" defaultValue={edit?.pay_when ?? "every"}>
                <option value="every">ทุกงวด</option>
                <option value="month_end">เฉพาะงวดสิ้นเดือน</option>
              </select>
            </label>
            <label>
              การปัดเศษ
              <select name="rounding" defaultValue={edit?.rounding ?? "none"}>
                <option value="none">ไม่ปัดเศษ</option>
                <option value="round">ปัดตามหลักคณิตศาสตร์</option>
                <option value="up">ปัดขึ้น</option>
                <option value="down">ปัดลง</option>
              </select>
            </label>
            <label>
              รหัสบัญชี
              <input name="account_code" defaultValue={edit?.account_code ?? ""} />
            </label>
            <label>
              ลำดับ
              <input type="number" name="sort" defaultValue={edit?.sort ?? 50} />
            </label>
            <div className="full">
              <div className="small muted">นำรายได้นี้ไปคำนวณกับ</div>
              <div className="row">
                {b("in_sso", "ประกันสังคม")}
                {b("in_pf", "กองทุนสำรองเลี้ยงชีพ")}
                {b("in_ewf", "กองทุนสงเคราะห์ลูกจ้าง")}
                {b("in_ot", "ค่าล่วงเวลา")}
              </div>
            </div>
            {edit && (
              <label className="check">
                <input type="checkbox" name="active" defaultChecked={edit.active} /> เปิดใช้งาน
              </label>
            )}
            <button className="btn primary">บันทึก</button>
          </form>
        </div>
      )}
    </>
  );
}
