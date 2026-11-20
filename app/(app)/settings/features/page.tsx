import { requirePerm } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { saveFeatures } from "@/app/actions/settings";
import Notice from "@/components/Notice";

const F: [string, string, string][] = [
  ["learn", "เรียนรู้", "สร้างคอร์สเรียนและการอบรม พร้อมเก็บผลการเรียนรู้"],
  ["welfare", "สวัสดิการ", "กำหนดประเภทสวัสดิการและวงเงินการเบิก"],
  ["expense", "ค่าใช้จ่าย", "เบิกค่าใช้จ่ายพร้อมอนุมัติผ่านระบบ และจ่ายพร้อมเงินเดือน"],
  ["warning", "หนังสือเตือน", "ออกหนังสือเตือนพร้อมสายอนุมัติ"],
  ["actions", "การดำเนินการ", "บรรจุ เลื่อนตำแหน่ง ปรับเงินเดือน โอนย้าย พ้นสภาพ พร้อมสายอนุมัติ"],
];

export default async function Features({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("settings.system");
  const s = (await getSettings()).features;
  return (
    <>
      <Notice sp={sp} />
      <form action={saveFeatures} className="card">
        <h2>จัดการฟีเจอร์</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {F.map(([k, n, d]) => (
            <label key={k} className="check">
              <input type="checkbox" name={k} defaultChecked={s[k] !== false} /> <b>{n}</b> <span className="small muted">{d}</span>
            </label>
          ))}
        </div>
        <button className="btn primary" style={{ marginTop: 12 }}>
          บันทึก
        </button>
      </form>
    </>
  );
}
