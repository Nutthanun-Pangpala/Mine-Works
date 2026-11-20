import { sql, q, tx } from "./db";
import { computeAttendance, summarize } from "./attendance";
import { conditionsOf, getSettings } from "./settings";
import { addDays, d2, daysInMonth, diffDays, monthEnd, round2 } from "./util";

/* =====================================================================
 * Thai payroll engine
 *  - salary / daily wage with proration
 *  - OT (OT1–OT4 multipliers per employment type) from approved OT requests
 *  - unpaid leave, absence, late/early deductions from attendance
 *  - shift allowance, diligence allowance, welfare/expense claims
 *  - recurring and one-off items, liabilities (loans, กยศ., กรมบังคับคดี)
 *  - social security (สปส.), provident fund, employee welfare fund (กสจ.)
 *  - personal income tax 40(1) — annualised withholding method
 * ===================================================================== */

export type TaxAllowances = {
  spouse?: boolean;           // คู่สมรสไม่มีเงินได้ 60,000
  children?: number;          // บุตร 30,000 คน
  children_2018?: number;     // บุตรคนที่ 2 ขึ้นไปที่เกิดตั้งแต่ปี 2561 60,000 คน
  parents?: number;           // บิดามารดา 30,000 คน (สูงสุด 4)
  disabled?: number;          // อุปการะผู้พิการ 60,000 คน
  life_insurance?: number;    // ≤ 100,000
  health_insurance?: number;  // ≤ 25,000 (รวมประกันชีวิต ≤ 100,000)
  parent_health?: number;     // ≤ 15,000
  pension_insurance?: number; // ≤ 15% / 200,000
  rmf?: number;
  ssf?: number;
  thai_esg?: number;          // ≤ 300,000
  home_loan_interest?: number;// ≤ 100,000
  donation?: number;
  donation_edu?: number;      // ×2
  other?: number;
};

export function taxOnNet(net: number, brackets: [number | null, number][]): number {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of brackets) {
    const top = upper === null ? Infinity : upper;
    if (net > lower) tax += ((Math.min(net, top) - lower) * rate) / 100;
    lower = top;
    if (net <= top) break;
  }
  return Math.max(0, tax);
}

export function allowanceTotal(a: TaxAllowances, cfg: any, annualWage: number, annualSSO: number, annualPF: number): number {
  let t = Number(cfg.personal ?? 60000);
  if (a.spouse) t += 60000;
  t += 30000 * Math.max(0, Number(a.children || 0));
  t += 60000 * Math.max(0, Number(a.children_2018 || 0));
  t += 30000 * Math.min(4, Math.max(0, Number(a.parents || 0)));
  t += 60000 * Math.max(0, Number(a.disabled || 0));
  const health = Math.min(25000, Number(a.health_insurance || 0));
  t += Math.min(100000, Number(a.life_insurance || 0) + health);
  t += Math.min(15000, Number(a.parent_health || 0));
  const retirementGroup =
    Math.min(Math.min(annualWage * 0.15, 200000), Number(a.pension_insurance || 0)) +
    Math.min(annualWage * 0.3, Number(a.rmf || 0)) +
    Math.min(Math.min(annualWage * 0.3, 200000), Number(a.ssf || 0)) +
    Math.min(Math.min(annualWage * 0.15, 500000), annualPF);
  t += Math.min(500000, retirementGroup);
  t += Math.min(300000, Number(a.thai_esg || 0));
  t += Math.min(100000, Number(a.home_loan_interest || 0));
  t += Math.max(0, annualSSO);
  t += Math.max(0, Number(a.other || 0));
  return t;
}

/** Annual tax for an annual 40(1) income. Donations are capped at 10% of income after other allowances. */
export function annualTax(income: number, a: TaxAllowances, cfg: any, annualSSO: number, annualPF: number): number {
  const expense = Math.min((income * Number(cfg.expense_rate ?? 50)) / 100, Number(cfg.expense_cap ?? 100000));
  let net = income - expense - allowanceTotal(a, cfg, income, annualSSO, annualPF);
  if (net > 0) {
    const don = Number(a.donation || 0) + 2 * Number(a.donation_edu || 0);
    net -= Math.min(don, net * 0.1);
  }
  return taxOnNet(Math.max(0, net), cfg.brackets);
}

export function periodsPerYear(freq: string): number {
  return freq === "semi" ? 24 : freq === "tri" ? 36 : freq === "weekly" ? 52 : 12;
}

export function periodIndex(freq: string, month: number, seq: number, endDate: string): number {
  if (freq === "weekly") {
    const doy = diffDays(`${endDate.slice(0, 4)}-01-01`, endDate) + 1;
    return Math.min(52, Math.ceil(doy / 7));
  }
  const per = freq === "semi" ? 2 : freq === "tri" ? 3 : 1;
  return (month - 1) * per + Math.min(seq, per);
}

function roundBy(v: number, mode: string): number {
  if (mode === "up") return Math.ceil(v);
  if (mode === "down") return Math.floor(v);
  if (mode === "round") return Math.round(v);
  return round2(v);
}

type Item = { pay_item_id: number; amount: number; qty?: number | null; source: string; note?: string | null };

export async function calculatePeriod(periodId: number) {
  const period = (
    await sql()`
      select p.*, p.start_date::text as sd, p.end_date::text as ed, p.att_start::text as asd, p.att_end::text as aed,
             p.pay_date::text as pd, c.frequency, et.pay_type, et.calc, et.ot_rates, et.paid_traditional_holiday,
             co.conditions
      from payroll_periods p
      left join payroll_cycles c on c.id = p.cycle_id
      left join employment_types et on et.id = p.employment_type_id
      join companies co on co.id = p.company_id
      where p.id = ${periodId}`
  )[0];
  if (!period) throw new Error("period not found");
  const freq = period.frequency || "monthly";
  const cond = conditionsOf({ conditions: period.conditions });
  const hpd = Number(cond.hours_per_day || 8);
  const settings = await getSettings();
  const ssoCfg = settings.sso;
  const ewfCfg = settings.ewf;
  const taxCfg = settings.tax;
  const calc = period.calc || {};
  const otRates = period.ot_rates || { ot1: 1, ot2: 1.5, ot3: 2, ot4: 3 };
  const isMonthEnd = period.ed === monthEnd(period.ed.slice(0, 7)) || period.ed.slice(8) >= "28" || freq === "monthly";
  const periodDays = diffDays(period.sd, period.ed) + 1;
  const ppy = periodsPerYear(freq);
  const idx = periodIndex(freq, period.month, period.seq, period.ed);
  const remaining = period.is_special ? 1 : Math.max(1, ppy - idx + 1);

  const items = await sql()`select * from pay_items where active and (company_id is null or company_id = ${period.company_id})`;
  const byKey = new Map<string, any>();
  const byId = new Map<number, any>();
  for (const it of items) {
    byId.set(it.id, it);
    if (it.system_key && !byKey.has(it.system_key)) byKey.set(it.system_key, it);
  }
  const sys = (k: string) => byKey.get(k);

  const manual = await sql()`select * from payroll_manual_items where period_id = ${periodId}`;
  let emps: any[];
  if (period.is_special) {
    const ids = [...new Set(manual.map((m: any) => m.employee_id))];
    emps = ids.length
      ? await sql().query(`select e.*, e.start_date::text as sdate, e.end_date::text as edate from employees e where e.id = any($1::int[])`, [ids])
      : [];
  } else {
    emps = await sql()`
      select e.*, e.start_date::text as sdate, e.end_date::text as edate from employees e
      where e.company_id = ${period.company_id}
        and (e.employment_type_id = ${period.employment_type_id} or ${period.employment_type_id}::int is null)
        and e.status <> 'pending'
        and (e.start_date is null or e.start_date <= ${period.ed})
        and (e.end_date is null or e.end_date >= ${period.sd})
      order by e.code`;
  }
  const ids = emps.map((e) => e.id);
  if (ids.length === 0) {
    await sql()`delete from payroll_lines where period_id = ${periodId}`;
    await sql()`update payroll_periods set status = 'calculated', calculated_at = now() where id = ${periodId}`;
    return { count: 0 };
  }

  const [att, ots, claims, recurring, liabs, ytdRows, openings, allowances, shifts, sameMonth, liabPaid] = await Promise.all([
    period.is_special ? Promise.resolve(new Map()) : computeAttendance(ids, period.asd, period.aed),
    sql().query(
      `select employee_id, minutes, payload from requests
       where doc_type = 'ot' and status = 'approved' and employee_id = any($1::int[]) and start_date between $2 and $3`,
      [ids, period.asd, period.aed],
    ),
    sql().query(
      `select r.employee_id, r.doc_type, r.amount, r.detail, w.pay_item_id
       from requests r left join welfare_types w on w.id = r.sub_type_id and r.doc_type = 'welfare'
       where r.doc_type in ('welfare','expense') and r.status = 'approved' and r.employee_id = any($1::int[])
         and r.start_date between $2 and $3`,
      [ids, period.asd, period.aed],
    ),
    sql().query(
      `select * from employee_pay_items where employee_id = any($1::int[])
         and (start_date is null or start_date <= $3) and (end_date is null or end_date >= $2)`,
      [ids, period.sd, period.ed],
    ),
    sql().query(`select * from liabilities where active and employee_id = any($1::int[]) and start_date <= $2`, [ids, period.ed]),
    sql().query(
      `select l.employee_id,
              sum((l.detail->>'taxable_regular')::numeric) as reg, sum((l.detail->>'taxable_irregular')::numeric) as irr,
              sum(l.tax) as tax, sum(l.sso_employee) as sso, sum(l.pf_employee) as pf
       from payroll_lines l join payroll_periods p on p.id = l.period_id
       where p.year = $2 and p.id <> $3 and p.status in ('approved','closed','paid') and l.employee_id = any($1::int[])
         and p.pay_date <= $4
       group by l.employee_id`,
      [ids, period.year, periodId, period.pd],
    ),
    sql().query(`select * from ytd_openings where year = $2 and employee_id = any($1::int[])`, [ids, period.year]),
    sql().query(`select * from tax_allowances where year = $2 and employee_id = any($1::int[])`, [ids, period.year]),
    sql()`select id, allowance from shifts`,
    sql().query(
      `select l.employee_id, sum(l.sso_base) as base, sum(l.sso_employee) as sso
       from payroll_lines l join payroll_periods p on p.id = l.period_id
       where p.company_id = $1 and p.year = $2 and p.month = $3 and p.id <> $4 and l.employee_id = any($5::int[])
       group by l.employee_id`,
      [period.company_id, period.year, period.month, periodId, ids],
    ),
    sql().query(
      `select substring(i.note from 'liab:(\\d+)')::int as liab_id, sum(i.amount) as paid
       from payroll_line_items i join payroll_lines l on l.id = i.line_id join payroll_periods p on p.id = l.period_id
       where i.note like 'liab:%' and p.id <> $1 and l.employee_id = any($2::int[])
       group by 1`,
      [periodId, ids],
    ),
  ]);

  const shiftAllowance = new Map<number, number>(shifts.map((s: any) => [s.id, Number(s.allowance || 0)]));
  const paidMap = new Map<number, number>(liabPaid.map((r: any) => [r.liab_id, Number(r.paid)]));

  const lines: { emp: any; items: Item[]; line: any }[] = [];

  for (const e of emps) {
    const out: Item[] = [];
    const add = (it: any, amount: number, source = "auto", note: string | null = null, qty: number | null = null) => {
      if (!it) return;
      const a = roundBy(amount, it.rounding);
      if (a === 0) return;
      out.push({ pay_item_id: it.id, amount: a, source, note, qty });
    };
    const payType = period.pay_type || "monthly";
    const rate = Number(e.salary || 0);
    const dayRate = payType === "monthly" ? rate / 30 : payType === "daily" ? rate : rate * hpd;
    const hourRate = payType === "monthly" ? rate / 30 / hpd : payType === "daily" ? rate / hpd : rate;
    const days = (att as Map<number, any>).get(e.id) || [];
    const s = summarize(days);

    if (!period.is_special) {
      // ---- base pay
      const from = e.sdate && e.sdate > period.sd ? e.sdate : period.sd;
      const to = e.edate && e.edate < period.ed ? e.edate : period.ed;
      const employedDays = Math.max(0, diffDays(from, to) + 1);
      if (payType === "monthly") {
        const per = freq === "semi" ? rate / 2 : freq === "tri" ? rate / 3 : freq === "weekly" ? (rate * 12) / 52 : rate;
        const base = employedDays >= periodDays ? per : employedDays * dayRate;
        add(sys("salary"), base, "auto", employedDays >= periodDays ? null : `${employedDays} วัน`, employedDays);
        if (calc.absent !== false && s.absent_days > 0 && cond.absent_deduct !== false) add(sys("absence"), s.absent_days * dayRate, "auto", null, s.absent_days);
        if (s.unpaid_leave_days > 0) add(sys("unpaid_leave"), s.unpaid_leave_days * dayRate, "auto", null, s.unpaid_leave_days);
      } else if (payType === "daily") {
        let paidDays = s.present_days;
        for (const d of days) for (const l of d.leaves) if (l.category === "leave" && l.paid && d.kind === "work") paidDays += l.days;
        if (period.paid_traditional_holiday) paidDays += s.traditional_holidays;
        add(sys("salary"), paidDays * dayRate, "auto", `${paidDays} วัน`, paidDays);
      } else {
        const hours = s.worked_min / 60;
        add(sys("salary"), hours * hourRate, "auto", `${round2(hours)} ชม.`, round2(hours));
      }
      if (calc.late !== false && cond.late_deduct && s.late_min + s.early_min > 0) {
        add(sys("late"), ((s.late_min + s.early_min) / 60) * hourRate, "auto", `${s.late_min + s.early_min} นาที`, s.late_min + s.early_min);
      }

      // ---- OT
      if (calc.ot !== false) {
        const byKind: Record<string, number> = {};
        for (const o of ots.filter((x: any) => x.employee_id === e.id)) {
          const k = o.payload?.ot_kind || "ot2";
          byKind[k] = (byKind[k] || 0) + Number(o.minutes || 0);
        }
        for (const [k, mins] of Object.entries(byKind)) {
          const mult = Number(otRates[k] ?? 1.5);
          add(sys("ot"), (mins / 60) * hourRate * mult, "auto", `${k.toUpperCase()} ${round2(mins / 60)} ชม. × ${mult}`, round2(mins / 60));
        }
      }

      // ---- shift allowance
      let allowance = 0;
      for (const [sid, n] of s.shift_days) allowance += (shiftAllowance.get(sid) || 0) * n;
      if (allowance) add(sys("shift_allowance"), allowance);

      // ---- diligence
      if (e.diligence_enabled && Number(cond.diligence_amount) > 0) {
        const brokenByLeave = days.some((d: any) => d.leaves.some((l: any) => l.category === "leave"));
        if (!s.absent_days && !s.late_count && !s.early_count && !s.missing && !brokenByLeave) add(sys("diligence"), Number(cond.diligence_amount));
      }

      // ---- claims
      for (const c of claims.filter((x: any) => x.employee_id === e.id)) {
        const it = c.doc_type === "welfare" ? byId.get(c.pay_item_id) || sys("welfare") : sys("expense");
        add(it, Number(c.amount || 0), "claim", c.detail);
      }

      // ---- recurring items
      for (const r of recurring.filter((x: any) => x.employee_id === e.id)) {
        const it = byId.get(r.pay_item_id);
        if (!it) continue;
        if (it.pay_when === "month_end" && !isMonthEnd) continue;
        add(it, Number(r.amount), "recurring", r.note);
      }

      // ---- liabilities
      for (const l of liabs.filter((x: any) => x.employee_id === e.id)) {
        const it = l.pay_item_id ? byId.get(l.pay_item_id) : sys(l.kind === "legal_execution" ? "legal_execution" : l.kind === "student_loan" ? "student_loan" : l.kind === "advance" ? "advance" : "loan");
        if (!it || (it.pay_when === "month_end" && !isMonthEnd)) continue;
        let amt = Number(l.installment);
        if (l.total) amt = Math.min(amt, Math.max(0, Number(l.total) - (paidMap.get(l.id) || 0)));
        if (amt > 0) add(it, amt, "liability", `liab:${l.id}`);
      }
    }

    // ---- manual items for this period
    for (const m of manual.filter((x: any) => x.employee_id === e.id)) add(byId.get(m.pay_item_id), Number(m.amount), "manual", m.note);

    // ---- statutory
    const sum = (pred: (it: any) => boolean) =>
      out.reduce((a, x) => {
        const it = byId.get(x.pay_item_id);
        if (!it || !pred(it)) return a;
        return a + (it.kind === "income" ? x.amount : -x.amount);
      }, 0);
    const ssoBase = Math.max(0, sum((it) => it.in_sso));
    let ssoEE = 0;
    let ssoER = 0;
    const prevMonth = sameMonth.find((x: any) => x.employee_id === e.id);
    if (e.sso_enabled && isMonthEnd && !period.is_special) {
      const monthBase = ssoBase + Number(prevMonth?.base || 0);
      const b = Math.min(Number(ssoCfg.base_max), Math.max(Number(ssoCfg.base_min), monthBase));
      const clamp = (v: number) => Math.min(Number(ssoCfg.max), Math.max(Number(ssoCfg.min), v));
      ssoEE = Math.max(0, clamp(Math.round((b * Number(ssoCfg.rate_employee)) / 100)) - Number(prevMonth?.sso || 0));
      ssoER = clamp(Math.round((b * Number(ssoCfg.rate_employer)) / 100));
      if (monthBase <= 0) ssoEE = ssoER = 0;
    }
    if (ssoEE) add(sys("sso"), ssoEE);

    const pfBase = Math.max(0, sum((it) => it.in_pf));
    const pfEE = e.pf_enabled ? round2((pfBase * Number(e.pf_employee_rate || 0)) / 100) : 0;
    const pfER = e.pf_enabled ? round2((pfBase * Number(e.pf_employer_rate || 0)) / 100) : 0;
    if (pfEE) add(sys("pf"), pfEE);

    const ewfBase = Math.max(0, sum((it) => it.in_ewf));
    const ewfOn = e.ewf_enabled && ewfCfg.start && period.pd >= ewfCfg.start;
    const ewfEE = ewfOn ? round2((ewfBase * Number(ewfCfg.rate_employee || 0)) / 100) : 0;
    const ewfER = ewfOn ? round2((ewfBase * Number(ewfCfg.rate_employer || 0)) / 100) : 0;
    if (ewfEE) add(sys("ewf"), ewfEE);

    // ---- income tax 40(1)
    const taxable = (mode: string) =>
      out.reduce((a, x) => {
        const it = byId.get(x.pay_item_id);
        if (!it || !it.income_type || it.tax_mode !== mode) return a;
        return a + (it.kind === "income" ? x.amount : -x.amount);
      }, 0);
    let R = period.is_special ? 0 : taxable("annual");
    let I = taxable("once") + (period.is_special ? taxable("annual") : 0);
    const y = ytdRows.find((x: any) => x.employee_id === e.id) || {};
    const op = openings.find((x: any) => x.employee_id === e.id) || {};
    const ytdReg = Number(y.reg || 0) + Number(op.income || 0);
    const ytdIrr = Number(y.irr || 0);
    const ytdTax = Number(y.tax || 0) + Number(op.tax || 0);
    const ytdSSO = Number(y.sso || 0) + Number(op.sso || 0);
    const ytdPF = Number(y.pf || 0) + Number(op.pf || 0);
    const al: TaxAllowances = allowances.find((x: any) => x.employee_id === e.id)?.data || {};

    let tax = 0;
    let projected = 0;
    let annual = 0;
    const computeTax = (extraIncome: number) => {
      const reg = R + extraIncome;
      projected = ytdReg + reg * remaining;
      const annSSO = Math.min(Number(ssoCfg.max) * 12, ytdSSO + ssoEE * remaining);
      const annPF = ytdPF + pfEE * remaining;
      const tExcl = annualTax(projected + ytdIrr, al, taxCfg, annSSO, annPF);
      const tAll = annualTax(projected + ytdIrr + I, al, taxCfg, annSSO, annPF);
      annual = tAll;
      const regularPart = period.is_special ? 0 : Math.max(0, (tExcl - ytdTax) / remaining);
      return round2(regularPart + (tAll - tExcl));
    };
    if (e.tax_method === "none") tax = 0;
    else if (e.tax_method === "company_always") {
      let gross = 0;
      for (let i = 0; i < 25; i++) {
        const t = computeTax(gross);
        if (Math.abs(t - gross) < 0.01) break;
        gross = t;
      }
      tax = computeTax(gross);
      if (tax) {
        add(sys("tax_company"), tax);
        R += tax;
      }
    } else {
      tax = computeTax(0);
      if (tax && e.tax_method === "company_once") {
        add(sys("tax_company"), tax);
        I += tax;
        tax = computeTax(0);
      }
    }
    if (tax > 0) add(sys("wht"), tax);

    const gross = round2(out.filter((x) => byId.get(x.pay_item_id)?.kind === "income").reduce((a, x) => a + x.amount, 0));
    const ded = round2(out.filter((x) => byId.get(x.pay_item_id)?.kind === "deduction").reduce((a, x) => a + x.amount, 0));
    lines.push({
      emp: e,
      items: out,
      line: {
        gross, deductions: ded, net: round2(gross - ded), taxable: round2(R + I), tax: Math.max(0, tax),
        sso_employee: ssoEE, sso_employer: ssoER, sso_base: ssoBase, pf_employee: pfEE, pf_employer: pfER,
        ewf_employee: ewfEE, ewf_employer: ewfER,
        detail: {
          pay_type: payType, rate, day_rate: round2(dayRate), hour_rate: round2(hourRate), taxable_regular: round2(R),
          taxable_irregular: round2(I), remaining_periods: remaining, projected_annual: round2(projected),
          annual_tax: round2(annual), ytd_tax: ytdTax,
          att: {
            work_days: s.work_days, present_days: s.present_days, absent_days: s.absent_days, late_min: s.late_min,
            early_min: s.early_min, leave_days: s.leave_days, unpaid_leave_days: s.unpaid_leave_days, missing: s.missing,
          },
        },
      },
    });
  }

  await sql()`delete from payroll_lines where period_id = ${periodId}`;
  for (const l of lines) {
    const ins = await sql()`
      insert into payroll_lines (period_id, employee_id, gross, deductions, net, taxable, tax, sso_employee, sso_employer,
        sso_base, pf_employee, pf_employer, ewf_employee, ewf_employer, detail)
      values (${periodId}, ${l.emp.id}, ${l.line.gross}, ${l.line.deductions}, ${l.line.net}, ${l.line.taxable}, ${l.line.tax},
        ${l.line.sso_employee}, ${l.line.sso_employer}, ${l.line.sso_base}, ${l.line.pf_employee}, ${l.line.pf_employer},
        ${l.line.ewf_employee}, ${l.line.ewf_employer}, ${JSON.stringify(l.line.detail)}::jsonb)
      returning id`;
    const lineId = ins[0].id;
    if (l.items.length)
      await tx(
        l.items.map((it) => q`
          insert into payroll_line_items (line_id, pay_item_id, amount, qty, source, note)
          values (${lineId}, ${it.pay_item_id}, ${it.amount}, ${it.qty ?? null}, ${it.source}, ${it.note ?? null})`),
      );
  }
  await sql()`update payroll_periods set status = 'calculated', calculated_at = now() where id = ${periodId}`;
  return { count: lines.length };
}

/* ---------------- Period generation ---------------- */

function payDateFor(cycle: any, end: string): string {
  const ym = end.slice(0, 7);
  if (cycle.pay_rule === "same_month" && cycle.pay_day) {
    const [y, m] = ym.split("-").map(Number);
    return `${ym}-${d2(Math.min(cycle.pay_day, daysInMonth(y, m)))}`;
  }
  if (cycle.pay_rule === "next_month" && cycle.pay_day) {
    const [y, m] = ym.split("-").map(Number);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return `${ny}-${d2(nm)}-${d2(Math.min(cycle.pay_day, daysInMonth(ny, nm)))}`;
  }
  return end;
}

/** Periods (start/end) of a cycle within a calendar month. */
export function periodsInMonth(cycle: any, ym: string): { seq: number; start: string; end: string }[] {
  const [y, m] = ym.split("-").map(Number);
  const startDay = Number(String(cycle.first_start_date).slice(8, 10)) || 1;
  const last = daysInMonth(y, m);
  if (cycle.frequency === "weekly") {
    const out = [];
    let s = String(cycle.first_start_date).slice(0, 10);
    while (s < `${ym}-01`) s = addDays(s, 7);
    let seq = 1;
    while (s <= monthEnd(ym)) {
      out.push({ seq: seq++, start: s, end: addDays(s, 6) });
      s = addDays(s, 7);
    }
    return out;
  }
  if (cycle.frequency === "semi") {
    return [
      { seq: 1, start: `${ym}-01`, end: `${ym}-15` },
      { seq: 2, start: `${ym}-16`, end: `${ym}-${d2(last)}` },
    ];
  }
  if (cycle.frequency === "tri") {
    return [
      { seq: 1, start: `${ym}-01`, end: `${ym}-10` },
      { seq: 2, start: `${ym}-11`, end: `${ym}-20` },
      { seq: 3, start: `${ym}-21`, end: `${ym}-${d2(last)}` },
    ];
  }
  if (startDay <= 1) return [{ seq: 1, start: `${ym}-01`, end: `${ym}-${d2(last)}` }];
  // e.g. 21st of previous month → 20th of this month
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const s = `${py}-${d2(pm)}-${d2(Math.min(startDay, daysInMonth(py, pm)))}`;
  return [{ seq: 1, start: s, end: `${ym}-${d2(Math.min(startDay - 1, last))}` }];
}

export async function createPeriodsForMonth(cycleId: number, ym: string): Promise<number> {
  const cycle = (await sql()`select *, first_start_date::text as first_start_date from payroll_cycles where id = ${cycleId}`)[0];
  if (!cycle) return 0;
  const et = (await sql()`select name from employment_types where id = ${cycle.employment_type_id}`)[0];
  let n = 0;
  for (const p of periodsInMonth(cycle, ym)) {
    const exists = await sql()`select 1 from payroll_periods where cycle_id = ${cycleId} and start_date = ${p.start} and not is_special`;
    if (exists[0]) continue;
    let attStart = p.start;
    let attEnd = p.end;
    if (cycle.off_period_from && cycle.frequency === "monthly") {
      // attendance / OT closes on day N: previous month N+1 .. this month N
      const [y, m] = p.end.slice(0, 7).split("-").map(Number);
      const day = Math.min(cycle.off_period_from, daysInMonth(y, m));
      attEnd = `${p.end.slice(0, 7)}-${d2(day)}`;
      attStart = addDays(addDays(attEnd, 1), -daysInMonth(y, m === 1 ? 12 : m - 1));
    }
    const [y, m] = ym.split("-").map(Number);
    await sql()`
      insert into payroll_periods (cycle_id, company_id, employment_type_id, name, year, month, seq, start_date, end_date,
        att_start, att_end, pay_date)
      values (${cycleId}, ${cycle.company_id}, ${cycle.employment_type_id},
        ${`${et?.name ?? ""} ${String(m).padStart(2, "0")}/${y + 543}${p.seq > 1 || cycle.frequency !== "monthly" ? ` งวด ${p.seq}` : ""}`},
        ${y}, ${m}, ${p.seq}, ${p.start}, ${p.end}, ${attStart}, ${attEnd}, ${payDateFor(cycle, p.end)})`;
    n++;
  }
  return n;
}
