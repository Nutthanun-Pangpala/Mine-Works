import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies, levels } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { deleteLeaveType, saveLeaveQuota, saveLeaveType } from "@/app/actions/settings";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";
import ConfirmButton from "@/components/ConfirmButton";

const CAT: Record<string, string> = { leave: "ลางาน", offsite: "ปฏิบัติงานนอกสถานที่", certify: "รับรองเวลา", swap: "แลกเวลา", accumulate: "ขอสะสมเวลา" };
const grid = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", alignItems: "end" } as const;

export default async function LeaveTypes({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.time");
  const [types, cos, lv] = await Promise.all([sql()`select * from leave_types order by sort, id`, companies(), levels()]);
  const isNew = sp.new === "1";
  const t = isNew ? null : types.find((x: any) => x.id === Number(sp.id)) || types[0];
  const tab = sp.tab === "quota" ? "quota" : "rules";
  const r = t?.rules || {};
  const q = t?.quota || {};
  const cat = isNew ? sp.cat || "leave" : t?.category;
  const b = (k: string, label: string) => (
    <label className="check">
      <input type="checkbox" name={k} defaultChecked={!!r[k]} /> {label}
    </label>
  );
  const n = (k: string, label: string) => (
    <label>
      {label}
      <input type="number" step="any" name={k} defaultValue={r[k] ?? ""} />
    </label>
  );
  const tiers: [number, number][] = q.tenure || [];
  return (
    <>
      <Notice sp={sp} />
      <div className="layout2" style={{ gridTemplateColumns: "230px 1fr" }}>
        <nav className="subnav">
          {Object.entries(CAT).map(([c, label]) => (
            <div key={c} style={{ display: "contents" }}>
              <div className="grp">
                {label}{" "}
                <Link href={`/settings/leave-types?new=1&cat=${c}`} className="small">
                  + เพิ่ม
                </Link>
              </div>
              {types
                .filter((x: any) => x.category === c)
                .map((x: any) => (
                  <Link key={x.id} href={`/settings/leave-types?id=${x.id}`} className={t?.id === x.id ? "on" : ""} style={{ opacity: x.active ? 1 : 0.5 }}>
                    {x.name}
                  </Link>
                ))}
            </div>
          ))}
        </nav>
        <div>
          {t && !isNew && (
            <Tabs
              small
              tabs={[
                { href: `/settings/leave-types?id=${t.id}`, label: CAT[t.category], on: tab === "rules" },
                { href: `/settings/leave-types?id=${t.id}&tab=quota`, label: "สิทธิ์การลา", on: tab === "quota", hidden: t.category !== "leave" },
                { href: `/settings/workflows?doc=${t.category === "offsite" ? "offsite" : t.category === "leave" ? "leave" : t.category}${["leave", "offsite"].includes(t.category) ? `&sub=${t.id}` : ""}`, label: "เงื่อนไขการอนุมัติ" },
              ]}
            />
          )}
          {(tab === "rules" || isNew) && (
            <form action={saveLeaveType} className="card" key={t?.id ?? "new"}>
              {t && !isNew && <input type="hidden" name="id" value={t.id} />}
              <input type="hidden" name="category" value={cat} />
              <div style={grid}>
                <label>
                  ชื่อประเภท*
                  <input name="name" required defaultValue={isNew ? "" : t?.name} />
                </label>
                <label>
                  ชื่อประเภท (EN)
                  <input name="name_en" defaultValue={isNew ? "" : t?.name_en ?? ""} />
                </label>
                <label>
                  รหัส
                  <input name="code" defaultValue={isNew ? "" : t?.code ?? ""} />
                </label>
                <label>
                  ใช้กับบริษัท
                  <select name="company_id" defaultValue={isNew ? "" : t?.company_id ?? ""}>
                    <Opt list={cos} label="name_th" empty="ใช้กับทุกบริษัท" />
                  </select>
                </label>
                {isNew && (
                  <label>
                    ประเภทฐาน
                    <select name="base_kind" defaultValue="other">
                      <option value="other">อื่นๆ</option>
                      <option value="personal">ลากิจ</option>
                      <option value="vacation">ลาพักร้อน</option>
                      <option value="sick">ลาป่วย</option>
                      <option value="maternity">ลาคลอด</option>
                    </select>
                  </label>
                )}
                <label className="full">
                  รายละเอียด
                  <input name="description" defaultValue={isNew ? "" : t?.description ?? ""} />
                </label>
              </div>
              <fieldset style={{ marginTop: 14 }}>
                <legend>การขอ</legend>
                <div style={grid}>
                  {cat !== "certify" && n("min_minutes", "นาทีขั้นต่ำ*")}
                  {n("max_docs_per_day", "จำกัดจำนวนเอกสารต่อวัน")}
                  {b("allow_advance", "ขอล่วงหน้าได้")}
                  {b("allow_backdate", "ขอย้อนหลังได้")}
                  {n("backdate_days", "ย้อนหลังได้ไม่เกิน (วัน)")}
                  {cat === "leave" && b("min_half_day", "ต้องลาอย่างน้อยครึ่งวัน")}
                  {["leave", "offsite"].includes(cat) && n("max_consecutive_days", "ลาติดต่อกันได้ไม่เกิน (วัน)")}
                  {["leave", "offsite"].includes(cat) && (
                    <label>
                      เพศ
                      <select name="gender" defaultValue={r.gender ?? "all"}>
                        <option value="all">ลาได้ทุกเพศ</option>
                        <option value="male">ชาย</option>
                        <option value="female">หญิง</option>
                      </select>
                    </label>
                  )}
                  {b("after_probation", "ต้องผ่านทดลองงาน")}
                  {b("attach", "ต้องแนบไฟล์")}
                  {cat === "leave" && n("attach_after_days", "ต้องแนบไฟล์เมื่อลาตั้งแต่ (วัน)")}
                  {cat === "offsite" && b("allow_checkin", "เปิดให้เช็กอินได้")}
                  {cat === "certify" && b("allow_on_holiday", "รับรองเวลาได้ในวันหยุด")}
                  {cat === "accumulate" && b("holiday_only", "ต้องเป็นวันหยุด")}
                  {["swap", "accumulate"].includes(cat) && n("min_balance_minutes", "นาทีขั้นต่ำคงเหลือที่สามารถแลกเวลา")}
                  {["swap", "accumulate"].includes(cat) && n("use_within_days", "ต้องแลกใช้ภายใน (วัน)")}
                </div>
              </fieldset>
              {cat === "leave" && (
                <fieldset>
                  <legend>เงื่อนไข</legend>
                  <div style={grid}>
                    {b("paid", "ได้รับค่าจ้าง")}
                    {n("paid_days", "จ่ายค่าจ้างไม่เกิน (วัน/ปี)")}
                    {b("count_holidays", "นับวันหยุดเป็นวันลา")}
                    {b("once", "ลาได้ครั้งเดียว")}
                    {b("diligence_keep", "ได้เบี้ยขยัน")}
                    {n("carry_over", "สะสมข้ามปีได้ไม่เกิน (วัน)")}
                    {b("birth_month_only", "ใช้ได้เฉพาะในเดือนเกิด")}
                    {b("count_probation", "นับอายุช่วงทดลองงาน")}
                  </div>
                </fieldset>
              )}
              {cat === "offsite" && <div style={grid}>{b("diligence_keep", "ได้เบี้ยขยัน")}{b("count_holidays", "นับวันหยุดเป็นวันลา")}</div>}
              <div className="row" style={{ marginTop: 12 }}>
                <label>
                  ลำดับ
                  <input type="number" name="sort" defaultValue={isNew ? 50 : t?.sort} style={{ width: 90 }} />
                </label>
                {t && !isNew && (
                  <label className="check">
                    <input type="checkbox" name="active" defaultChecked={t.active} /> ใช้งาน
                  </label>
                )}
                <button className="btn primary">บันทึก</button>
              </div>
            </form>
          )}
          {tab === "quota" && t && !isNew && (
            <form action={saveLeaveQuota} className="card">
              <input type="hidden" name="id" value={t.id} />
              <div style={grid}>
                <label>
                  หน่วย
                  <select name="unit" defaultValue={q.unit ?? "day"}>
                    <option value="day">จำนวนวัน</option>
                    <option value="hour">จำนวนชั่วโมง</option>
                    <option value="unlimited">ไม่จำกัดวัน</option>
                  </select>
                </label>
                <label>
                  กำหนดสิทธิ์
                  <select name="by" defaultValue={q.by ?? "all"}>
                    <option value="all">ทุกระดับเท่ากัน</option>
                    <option value="level">ตามระดับตำแหน่ง</option>
                    <option value="tenure">ตามอายุงาน</option>
                  </select>
                </label>
                <label>
                  จำนวนวันต่อปี (ค่าตั้งต้น)
                  <input type="number" step="0.5" name="days" defaultValue={q.days ?? 0} />
                </label>
                <label className="check">
                  <input type="checkbox" name="prorate" defaultChecked={!!q.prorate} /> คิดโปรเรต (ปีแรก)
                </label>
              </div>
              <fieldset style={{ marginTop: 14 }}>
                <legend>ตามระดับตำแหน่ง</legend>
                <div style={grid}>
                  {lv.map((l: any) => (
                    <label key={l.id}>
                      {l.code}
                      <input type="number" step="0.5" name={`level_${l.id}`} defaultValue={q.levels?.[l.id] ?? ""} />
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>ตามอายุงาน (อายุงานครบ ≥ ปี → จำนวนวัน)</legend>
                {[...tiers, [0, 0], [0, 0], [0, 0]].slice(0, Math.max(4, tiers.length + 2)).map((x: any, i: number) => (
                  <div className="row" key={i} style={{ marginBottom: 6 }}>
                    <input type="number" step="0.5" name="tenure_years" defaultValue={i < tiers.length ? x[0] : ""} placeholder="อายุงาน (ปี)" style={{ width: 140 }} />
                    <input type="number" step="0.5" name="tenure_days" defaultValue={i < tiers.length ? x[1] : ""} placeholder="จำนวนวัน" style={{ width: 140 }} />
                  </div>
                ))}
              </fieldset>
              <button className="btn primary">บันทึก</button>
              <p className="small muted">กำหนดสิทธิ์รายบุคคลได้ที่ โปรไฟล์พนักงาน → เวิร์กอิน / สิทธิ์การลา</p>
            </form>
          )}
          {t && !isNew && (
            <form action={deleteLeaveType}>
              <input type="hidden" name="id" value={t.id} />
              <ConfirmButton message="ปิดการใช้งานประเภทนี้?">ปิดการใช้งาน</ConfirmButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
