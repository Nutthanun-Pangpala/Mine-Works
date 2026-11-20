"use client";

export default function PrintButton({ label = "พิมพ์ / บันทึก PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn noprint" onClick={() => window.print()}>
      {label}
    </button>
  );
}
