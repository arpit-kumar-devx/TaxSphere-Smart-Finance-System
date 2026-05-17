/**
 * India income tax (individual, resident) — simplified slabs AY 2024-25 style.
 * Old regime: slab + Section 87A rebate up to ₹12,500 when taxable ≤ ₹5L.
 * New regime: slab + 87A-style full rebate when taxable ≤ ₹7L (tax before rebate zeroed).
 * Health & education cess: 4% on tax after rebate.
 */

export type TaxRegime = 'OLD' | 'NEW';

export interface IncomeBreakdown {
  salary: number;
  business: number;
  capitalGains: number;
  otherIncome: number;
}

export interface DeductionBreakdown {
  c80C: number;
  c80D: number;
  c80E: number;
  c80G: number;
  nps: number;
}

const STD_OLD = 50_000; // standard deduction (salaried) — approximation
const STD_NEW = 75_000; // new regime standard deduction FY 2024-25 onward

function sumIncome(i: IncomeBreakdown): number {
  return (
    Math.max(0, i.salary) +
    Math.max(0, i.business) +
    Math.max(0, i.capitalGains) +
    Math.max(0, i.otherIncome)
  );
}

function sumDeductions(d: DeductionBreakdown): number {
  return (
    Math.max(0, d.c80C) +
    Math.max(0, d.c80D) +
    Math.max(0, d.c80E) +
    Math.max(0, d.c80G) +
    Math.max(0, d.nps)
  );
}

export function computeTaxableIncome(
  income: IncomeBreakdown,
  deductions: DeductionBreakdown,
  regime: TaxRegime
): { totalIncome: number; totalDeductions: number; taxableIncome: number } {
  const totalIncome = sumIncome(income);
  const totalDeductions = sumDeductions(deductions);

  if (regime === 'OLD') {
    const taxable = Math.max(0, totalIncome - STD_OLD - totalDeductions);
    return { totalIncome, totalDeductions, taxableIncome: taxable };
  }

  const taxable = Math.max(0, totalIncome - STD_NEW);
  return { totalIncome, totalDeductions: 0, taxableIncome: taxable };
}

function taxOldSlabs(taxable: number): number {
  let tax = 0;
  let rem = taxable;
  const b1 = 250_000;
  const b2 = 500_000;
  const b3 = 1_000_000;

  if (rem <= b1) return 0;
  rem -= b1;
  const s1 = Math.min(rem, b2 - b1);
  tax += s1 * 0.05;
  rem -= s1;
  if (rem <= 0) return Math.round(tax * 100) / 100;

  const s2 = Math.min(rem, b3 - b2);
  tax += s2 * 0.2;
  rem -= s2;
  if (rem <= 0) return Math.round(tax * 100) / 100;

  tax += rem * 0.3;
  return Math.round(tax * 100) / 100;
}

function taxNewSlabs(taxable: number): number {
  let tax = 0;
  let rem = taxable;
  const slabs = [
    [300_000, 0],
    [300_000, 0.05],
    [300_000, 0.1],
    [300_000, 0.15],
    [300_000, 0.2],
    [Number.POSITIVE_INFINITY, 0.3],
  ] as const;

  for (const [width, rate] of slabs) {
    if (rem <= 0) break;
    const chunk = Math.min(rem, width);
    tax += chunk * rate;
    rem -= chunk;
  }
  return Math.round(tax * 100) / 100;
}

function rebate87A(taxBefore: number, taxableIncome: number, regime: TaxRegime): number {
  if (regime === 'OLD') {
    if (taxableIncome <= 500_000) return Math.min(12_500, taxBefore);
    return 0;
  }
  if (taxableIncome <= 700_000) return taxBefore;
  return 0;
}

export interface TaxSummary {
  taxableIncome: number;
  taxBeforeRebate: number;
  rebate87A: number;
  cess: number;
  finalTax: number;
}

export function calculateTax(
  income: IncomeBreakdown,
  deductions: DeductionBreakdown,
  regime: TaxRegime
): TaxSummary & { totalIncome: number; totalDeductions: number } {
  const { totalIncome, totalDeductions, taxableIncome } = computeTaxableIncome(
    income,
    deductions,
    regime
  );

  const taxBeforeRebate =
    regime === 'OLD' ? taxOldSlabs(taxableIncome) : taxNewSlabs(taxableIncome);

  const rebate = rebate87A(taxBeforeRebate, taxableIncome, regime);
  const afterRebate = Math.max(0, taxBeforeRebate - rebate);
  const cess = Math.round(afterRebate * 0.04 * 100) / 100;
  const finalTax = Math.round((afterRebate + cess) * 100) / 100;

  return {
    totalIncome,
    totalDeductions,
    taxableIncome,
    taxBeforeRebate,
    rebate87A: rebate,
    cess,
    finalTax,
  };
}
