import { MESSAGES } from "@/lib/util";

export default function Notice({ sp }: { sp: any }) {
  if (sp?.error) {
    return <div className="notice err">{MESSAGES[String(sp.error)] || String(sp.error)}</div>;
  }
  if (sp?.ok) return <div className="notice ok">{sp.ok === "1" ? "บันทึกเรียบร้อย" : String(sp.ok)}</div>;
  return null;
}
