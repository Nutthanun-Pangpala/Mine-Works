import { requirePerm } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { saveStatutory } from "@/app/actions/settings";
import { money } from "@/lib/util";
import Notice from "@/components/Notice";

export default async function Statutory({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.payroll");
  const s = await getSettings();
  const grid = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" } as const;
  return (
    <>
      <Notice sp={sp} />
      <form action={saveStatutory}>
        <fieldset>
          <legend>อัตราสมทบประกันสังคม</legend>
          <p className="small muted">การแก้ไขอัตราหักสมทบระหว่างเดือนมีผลต่อการหักประกันสังคมของงวดที่ยังไม่ได้คำนวณ</p>
          <div style={grid}>
            <label>
              ฐานเงินเดือนต่ำสุด*
              <input type="number" name="sso_base_min" defaultValue={s.sso.base_min} />
            </label>
            <label>
              ฐานเงินเดือนสูงสุด*
              <input type="number" name="sso_base_max" defaultValue={s.sso.base_max} />
            </label>
            <label>
              สมทบต่ำสุด*
              <input type="number" name="sso_min" defaultValue={s.sso.min} />
            </label>
            <label>
              สมทบสูงสุด*
              <input type="number" name="sso_max" defaultValue={s.sso.max} />
            </label>
            <label>
              อัตราสมทบผู้ประกันตน (%)*
              <input type="number" step="0.01" name="sso_rate_employee" defaultValue={s.sso.rate_employee} />
            </label>
            <label>
              อัตราสมทบนายจ้าง (%)*
              <input type="number" step="0.01" name="sso_rate_employer" defaultValue={s.sso.rate_employer} />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>กองทุนสงเคราะห์ลูกจ้าง (กสจ.)</legend>
          <div style={grid}>
            <label>
              เริ่มจัดเก็บตั้งแต่วันที่จ่าย
              <input type="date" name="ewf_start" defaultValue={s.ewf.start} />
            </label>
            <label>
              ลูกจ้างสะสม (%)
              <input type="number" step="0.01" name="ewf_rate_employee" defaultValue={s.ewf.rate_employee} />
            </label>
            <label>
              นายจ้างสมทบ (%)
              <input type="number" step="0.01" name="ewf_rate_employer" defaultValue={s.ewf.rate_employer} />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>ภาษีเงินได้บุคคลธรรมดา 40(1)</legend>
          <div style={grid}>
            <label>
              หักค่าใช้จ่าย (%)
              <input type="number" name="expense_rate" defaultValue={s.tax.expense_rate} />
            </label>
            <label>
              หักค่าใช้จ่ายสูงสุด (บาท)
              <input type="number" name="expense_cap" defaultValue={s.tax.expense_cap} />
            </label>
            <label>
              ลดหย่อนส่วนตัว (บาท)
              <input type="number" name="personal" defaultValue={s.tax.personal} />
            </label>
          </div>
          <table className="tbl compact" style={{ marginTop: 10, maxWidth: 420 }}>
            <thead>
              <tr>
                <th>เงินได้สุทธิไม่เกิน</th>
                <th className="num">อัตรา</th>
              </tr>
            </thead>
            <tbody>
              {s.tax.brackets.map((b: any, i: number) => (
                <tr key={i}>
                  <td>{b[0] === null ? "ส่วนที่เกิน" : money(b[0], 0)}</td>
                  <td className="num">{b[1]}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
        <button className="btn primary">บันทึก</button>
      </form>
    </>
  );
}
