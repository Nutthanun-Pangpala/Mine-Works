import Link from "next/link";
import { requireUser } from "@/lib/auth";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="printwrap">
      <div className="printbar noprint">
        <Link href="/">← กลับสู่ระบบ</Link>
        <PrintButton />
      </div>
      {children}
    </div>
  );
}
