import { cache } from "react";
import { sql } from "./db";

export const DEFAULT_SETTINGS: Record<string, any> = {
  org: {
    emp_code: { mode: "standard", prefix: "", digits: 5 },
    newsfeed: "all",
    passcode: "dob",
    show_mobile: false,
    show_birthday: true,
    invitation_code: "",
    clock_verify: "none",
    daily_report: false,
    expense_backdate_days: 60,
    expense_cutoff_day: 25,
    pnd_basis: "period_end",
    theme: "#0f5f5c",
  },
  sso: { base_min: 1650, base_max: 17500, min: 83, max: 875, rate_employee: 5, rate_employer: 5 },
  ewf: { start: "2027-01-01", rate_employee: 0.25, rate_employer: 0.25 },
  tax: {
    expense_rate: 50,
    expense_cap: 100000,
    personal: 60000,
    brackets: [
      [150000, 0],
      [300000, 5],
      [500000, 10],
      [750000, 15],
      [1000000, 20],
      [2000000, 25],
      [5000000, 30],
      [null, 35],
    ],
  },
  features: {
    learn: true,
    welfare: true,
    expense: true,
    warning: true,
    actions: true,
  },
  notifications: {},
};

export const DEFAULT_CONDITIONS = {
  hours_per_day: 8,
  hours_from_shift: false,
  annual_cutoff: "01-01",
  late_grace_min: 0,
  late_deduct: false,
  absent_after_min: 240,
  absent_deduct: true,
  score: { every: 1, absent: 10, no_clock: 5, certify: 2, late: 2, sick: 1, sick_file: 0, personal: 1, ordination: 0, maternity: 0 },
  shift_backdate: true,
  shift_backdate_days: 30,
  supervisor_change_shift: true,
  probation_days: 119,
  prorate_before_day: 15,
  half_month_from_15: true,
  retire_male: 60,
  retire_female: 60,
  count_month_if_last_day_after: 15,
  self_resign: false,
  auto_approve_separation: false,
  diligence_amount: 0,
  diligence_step: 0,
  diligence_max: 0,
};

export const DEFAULT_OT_RULES = {
  min_minutes: 30,
  max_docs_per_day: 0,
  allow_backdate: true,
  backdate_days: 30,
  after_probation: false,
  break_mode: "once",
  break_types: ["after"],
  break_minutes: 0,
  break_after_minutes: 0,
  rounding_minutes: 0,
  weekly_cap_hours: 36,
  holiday_rate_by_shift: true,
  abnormal_day_ot: true,
  flex_full_ot: false,
};

export const getSettings = cache(async (): Promise<Record<string, any>> => {
  const rows = await sql()`select key, value from settings`;
  const out: Record<string, any> = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = { ...DEFAULT_SETTINGS[k] };
  for (const r of rows) out[r.key] = { ...(DEFAULT_SETTINGS[r.key] || {}), ...(r.value || {}) };
  return out;
});

export async function setSetting(key: string, value: any) {
  await sql()`
    insert into settings (key, value, updated_at) values (${key}, ${JSON.stringify(value)}::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

export function conditionsOf(company: any): typeof DEFAULT_CONDITIONS {
  return { ...DEFAULT_CONDITIONS, ...(company?.conditions || {}) };
}
export function otRulesOf(company: any): typeof DEFAULT_OT_RULES {
  return { ...DEFAULT_OT_RULES, ...(company?.ot_rules || {}) };
}
