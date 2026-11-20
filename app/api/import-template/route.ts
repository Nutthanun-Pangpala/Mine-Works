import { csvResponse, EMP_COLUMNS } from "@/lib/csv";

export async function GET() {
  return csvResponse("employee-import-template.csv", [
    EMP_COLUMNS,
    ["00100", "นาย", "สมชาย", "ใจดี", "Somchai", "Jaidee", "ชาย", "male", "1990-05-20", "1234567890123", "somchai@example.com", "0812345678", "2026-01-05", "probation", "C01", "00000", "ขาย", "เจ้าหน้าที่ประสานงาน", "00001", "S1", "MONTHLY", "ประจำ", "25000", "ธนาคารกสิกรไทย", "1234567890", ""],
  ]);
}
