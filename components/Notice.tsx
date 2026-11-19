import { MESSAGES } from "@/lib/util";

export default function Notice({ sp }: { sp: any }) {
  if (sp?.error) {
    return <div className="notice err">{MESSAGES[String(sp.error)] || "ทำรายการไม่สำเร็จ"}</div>;
  }
  if (sp?.ok) return <div className="notice ok">บันทึกเรียบร้อย</div>;
  return null;
}
