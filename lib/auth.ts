import crypto from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";
import { Act, hasPerm, mergePerms } from "./perm";

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

export type User = {
  id: number;
  code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  work_email: string | null;
  company_id: number | null;
  supervisor_id: number | null;
  shift_id: number | null;
  status: string;
  gender: string | null;
  start_date: string | null;
  probation_end_date: string | null;
  position_name: string | null;
  unit_name: string | null;
  roles: { id: number; code: string; name: string; is_hr: boolean }[];
  perms: Record<string, Set<Act>>;
  payroll: Set<string>;
  isHR: boolean;
  isSupervisor: boolean;
};

export const getUser = cache(async (): Promise<User | null> => {
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
    select e.id, e.code, e.first_name, e.last_name, e.nickname, e.work_email, e.company_id, e.supervisor_id,
           e.shift_id, e.status, e.gender, e.start_date::text, e.probation_end_date::text,
           p.name as position_name, u.name as unit_name,
           exists(select 1 from employees s where s.supervisor_id = e.id and s.status <> 'terminated') as is_sup
    from employees e
    left join positions p on p.id = e.position_id
    left join org_units u on u.id = e.org_unit_id
    where e.id = ${Number(id)} and e.status <> 'terminated' and e.login_enabled`;
  const e = rows[0];
  if (!e) return null;

  const roles = await sql()`
    select r.id, r.code, r.name, r.is_hr, r.permissions, r.payroll_perms
    from roles r
    where r.active and (
      r.id in (select role_id from user_roles where employee_id = ${e.id})
      or r.auto = 'everyone'
      or (r.auto = 'supervisor' and ${e.is_sup}::boolean)
    )`;

  const payroll = new Set<string>();
  for (const r of roles) for (const p of r.payroll_perms || []) payroll.add(p);

  return {
    ...e,
    roles: roles.map((r: any) => ({ id: r.id, code: r.code, name: r.name, is_hr: r.is_hr })),
    perms: mergePerms(roles.map((r: any) => r.permissions)),
    payroll,
    isHR: roles.some((r: any) => r.is_hr),
    isSupervisor: !!e.is_sup,
  } as User;
});

export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

export function can(u: User | null, key: string, act: Act = "view"): boolean {
  if (!u) return false;
  return hasPerm(u.perms, key, act);
}

export async function requirePerm(key: string, act: Act = "view"): Promise<User> {
  const u = await requireUser();
  if (!can(u, key, act)) redirect("/?error=forbidden");
  return u;
}

export function canPayroll(u: User, p: string): boolean {
  return u.payroll.has(p);
}

/** All employees below u in the reporting line (direct + indirect). */
export async function subordinateIds(userId: number): Promise<number[]> {
  const rows = await sql()`
    with recursive t as (
      select id from employees where supervisor_id = ${userId} and status <> 'terminated'
      union
      select e.id from employees e join t on e.supervisor_id = t.id where e.status <> 'terminated'
    ) select id from t`;
  return rows.map((r: any) => r.id);
}

/** Employees visible to u for team screens: subordinates, or everyone for HR team viewers. */
export async function teamScope(u: User): Promise<number[] | "all"> {
  if (u.isHR && can(u, "team", "view")) return "all";
  return subordinateIds(u.id);
}
