"use client";

import { useRef, useState } from "react";

export default function CheckInButton({
  action,
  label,
}: {
  action: (fd: FormData) => Promise<void>;
  label: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function submit(lat?: number, lng?: number) {
    const f = ref.current;
    if (!f) return;
    (f.elements.namedItem("lat") as HTMLInputElement).value = lat != null ? String(lat) : "";
    (f.elements.namedItem("lng") as HTMLInputElement).value = lng != null ? String(lng) : "";
    f.requestSubmit();
  }

  function go() {
    setBusy(true);
    if (!("geolocation" in navigator)) {
      setMsg("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง บันทึกเวลาโดยไม่มีพิกัด");
      submit();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => submit(p.coords.latitude, p.coords.longitude),
      () => {
        setMsg("ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง บันทึกเวลาโดยไม่มีพิกัด");
        submit();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <form ref={ref} action={action}>
      <input type="hidden" name="lat" />
      <input type="hidden" name="lng" />
      <button type="button" className="btn primary" disabled={busy} onClick={go}>
        {busy ? "กำลังบันทึก…" : label}
      </button>
      {msg && <div className="muted small">{msg}</div>}
    </form>
  );
}
