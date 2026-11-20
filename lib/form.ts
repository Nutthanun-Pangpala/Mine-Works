import { isDate, isTime } from "./util";

export const str = (fd: FormData, k: string): string | null => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
export const num = (fd: FormData, k: string): number | null => {
  const v = str(fd, k);
  if (v === null) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
export const int = (fd: FormData, k: string): number | null => {
  const n = num(fd, k);
  return n === null ? null : Math.trunc(n);
};
export const bool = (fd: FormData, k: string): boolean => {
  const v = fd.get(k);
  return v === "on" || v === "true" || v === "1";
};
export const date = (fd: FormData, k: string): string | null => {
  const v = str(fd, k);
  return isDate(v) ? v : null;
};
export const time = (fd: FormData, k: string): string | null => {
  const v = str(fd, k);
  return isTime(v) ? v!.slice(0, 5) : null;
};
export const ints = (fd: FormData, k: string): number[] =>
  fd
    .getAll(k)
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x));
export const strs = (fd: FormData, k: string): string[] =>
  fd
    .getAll(k)
    .map((x) => String(x).trim())
    .filter(Boolean);
