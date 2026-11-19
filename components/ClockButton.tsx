"use client";

import { useRef, useState } from "react";

/** Clock in/out with GPS (เวิร์กอิน). Submits lat/lng with the form when the browser allows it. */
export default function ClockButton({ action, label, className = "btn primary" }: { action: (fd: FormData) => void; label: string; className?: string }) {
  const form = useRef<HTMLFormElement>(null);
  const lat = useRef<HTMLInputElement>(null);
  const lng = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const go = () => {
    setBusy(true);
    const submit = () => form.current?.requestSubmit();
    if (!navigator.geolocation) return submit();
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (lat.current) lat.current.value = String(p.coords.latitude);
        if (lng.current) lng.current.value = String(p.coords.longitude);
        submit();
      },
      () => submit(),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <form ref={form} action={action}>
      <input type="hidden" name="lat" ref={lat} />
      <input type="hidden" name="lng" ref={lng} />
      <button type="button" className={className} onClick={go} disabled={busy}>
        {busy ? "กำลังบันทึก…" : label}
      </button>
    </form>
  );
}
