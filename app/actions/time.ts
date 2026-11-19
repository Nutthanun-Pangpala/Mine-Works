"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { num, str } from "@/lib/form";
import { back } from "@/lib/nav";
import { distanceM, todayBkk } from "@/lib/util";

export async function clock(fd: FormData) {
  const u = await requireUser();
  const lat = num(fd, "lat");
  const lng = num(fd, "lng");
  const locs = await sql()`
    select w.* from work_locations w join employee_locations el on el.location_id = w.id
    where el.employee_id = ${u.id} and w.active`;
  let distance: number | null = null;
  let locationId: number | null = null;
  if (locs.length) {
    const free = locs.find((l: any) => ["anywhere", "wfh_clock", "wfh_both"].includes(l.mode));
    const gps = locs.filter((l: any) => l.mode === "gps" && l.lat !== null && l.lng !== null);
    if (free) locationId = free.id;
    if (lat !== null && lng !== null) {
      for (const l of gps) {
        const d = distanceM(lat, lng, l.lat, l.lng);
        if (distance === null || d < distance) {
          distance = d;
          if (d <= l.radius_m) locationId = l.id;
        }
      }
    }
    if (!locationId) back("/", { error: "far" });
  }
  await sql()`
    insert into clock_records (employee_id, ts, source, lat, lng, distance_m, location_id)
    values (${u.id}, now(), 'web', ${lat}, ${lng}, ${distance}, ${locationId})`;
  revalidatePath("/");
  back("/", { ok: "บันทึกเวลาเรียบร้อย" });
}

export async function saveDailyReport(fd: FormData) {
  const u = await requireUser();
  const body = str(fd, "body");
  const mood = num(fd, "mood");
  await sql()`
    insert into daily_reports (employee_id, report_date, mood, body) values (${u.id}, ${todayBkk()}, ${mood}, ${body})
    on conflict (employee_id, report_date) do update set mood = excluded.mood, body = excluded.body`;
  back("/");
}

export async function markNotificationsRead() {
  const u = await requireUser();
  await sql()`update notifications set read_at = now() where employee_id = ${u.id} and read_at is null`;
  back("/notifications");
}
