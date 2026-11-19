import crypto from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";

const COOKIE = "hr_session";
const MAX_AGE = 7 * 24 * 60 * 60;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(pw, salt, 64);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export async function createSession(id: number) {
  const payload = `${id}.${Date.now() + MAX_AGE * 1000}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export const getUser = cache(async (): Promise<any | null> => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const expected = sign(`${id}.${exp}`);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (!(Number(exp) > Date.now())) return null;
  const rows = await sql()`
    select id, code, email, role, first_name, last_name, manager_id, branch_id, shift_id
    from employees where id = ${Number(id)} and status = 'active'`;
  return rows[0] ?? null;
});

export async function requireUser(): Promise<any> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

export function isHR(u: any): boolean {
  return u?.role === "admin" || u?.role === "hr";
}

// r needs employee_id and manager_id of the requester
export function canApprove(u: any, r: any): boolean {
  if (r.employee_id === u.id) return u.role === "admin";
  return isHR(u) || r.manager_id === u.id;
}
