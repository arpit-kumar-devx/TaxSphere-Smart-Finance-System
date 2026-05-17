import PDFDocument from 'pdfkit';
import { Response } from 'express';

function envBool(v: string | undefined, fallback: boolean): boolean {
  if (typeof v !== 'string') return fallback;
  return v.toLowerCase() === 'true';
}

function envNum(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateGstBreakdown(input: { subtotalPaise: number; userState?: string }) {
  const gstEnabled = envBool(process.env.GST_ENABLED, true);
  const businessState = (process.env.BUSINESS_STATE || 'UP').toUpperCase();
  const userState = (input.userState || '').toUpperCase();
  const cgstRate = envNum(process.env.CGST_RATE, 9);
  const sgstRate = envNum(process.env.SGST_RATE, 9);
  const igstRate = envNum(process.env.IGST_RATE, 18);
  const gstRate = envNum(process.env.GST_RATE, 18);
  if (!gstEnabled) {
    return { gstRate: 0, cgst: 0, sgst: 0, igst: 0, totalGst: 0 };
  }
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (userState && userState === businessState) {
    cgst = Math.round((input.subtotalPaise * cgstRate) / 100);
    sgst = Math.round((input.subtotalPaise * sgstRate) / 100);
  } else {
    igst = Math.round((input.subtotalPaise * igstRate) / 100);
  }
  return {
    gstRate,
    cgst,
    sgst,
    igst,
    totalGst: cgst + sgst + igst,
  };
}

export function toRupeesFromMaybePaise(raw: number): number {
  const value = Number(raw || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  // Backward-compat guard: older records may store paise.
  if (value > 10000) return round2(value / 100);
  return round2(value);
}

// Public helper for consistent money normalization across modules.
export function normalizeMoney(value: number): number {
  return toRupeesFromMaybePaise(value);
}

export function buildCommission(caServiceFeeMaybePaise: number) {
  const commissionType = String(process.env.CA_COMMISSION_TYPE || 'percentage').toLowerCase() === 'fixed' ? 'fixed' : 'percentage';
  const percent = envNum(process.env.CA_COMMISSION_PERCENT, 40);
  const fixedCommission = envNum(process.env.CA_COMMISSION_FIXED, 300);
  const caServiceFeeRupees = toRupeesFromMaybePaise(caServiceFeeMaybePaise);
  const commissionAmount =
    commissionType === 'percentage'
      ? round2(caServiceFeeRupees * (percent / 100))
      : round2(fixedCommission);

  if (process.env.NODE_ENV !== 'production') {
    console.log('[commission][debug]', {
      caServiceFeeRaw: caServiceFeeMaybePaise,
      caServiceFeeRupees,
      commissionType,
      commissionPercent: percent,
      commissionAmount,
    });
  }

  return {
    caServiceFeeRupees,
    commissionType: commissionType as 'percentage' | 'fixed',
    commissionPercent: percent,
    commissionAmount,
  };
}

export function normalizeCommissionAmountRupees(input: {
  commissionAmount?: number;
  caServiceFee?: number;
  paymentCaServiceFee?: number;
}): { commissionAmount: number; caServiceFee: number } {
  const feeSource = Number(input.paymentCaServiceFee || input.caServiceFee || 0);
  const caServiceFeeRupees = toRupeesFromMaybePaise(feeSource);
  const rawCommissionRupees = toRupeesFromMaybePaise(Number(input.commissionAmount || 0));

  if (caServiceFeeRupees <= 0) {
    return { commissionAmount: rawCommissionRupees, caServiceFee: 0 };
  }

  const expectedCommission = buildCommission(feeSource).commissionAmount;
  // If historical rows are wildly off, trust deterministic recomputation from fee config.
  const suspicious =
    rawCommissionRupees <= 0 ||
    rawCommissionRupees > expectedCommission * 2 ||
    rawCommissionRupees < expectedCommission * 0.5;

  return {
    commissionAmount: suspicious ? expectedCommission : rawCommissionRupees,
    caServiceFee: caServiceFeeRupees,
  };
}

function formatInr(paise: number): string {
  return `INR ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function sendPaymentPdf(args: {
  res: Response;
  title: string;
  fileName: string;
  lines: Array<{ label: string; value: string }>;
  footer?: string;
}) {
  const doc = new PDFDocument({ margin: 40 });
  args.res.setHeader('Content-Type', 'application/pdf');
  args.res.setHeader('Content-Disposition', `attachment; filename="${args.fileName}"`);
  doc.pipe(args.res);

  doc.fontSize(20).text('TaxSphere', { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(16).text(args.title, { align: 'left' });
  doc.moveDown(1);

  args.lines.forEach((line) => {
    doc.fontSize(11).text(`${line.label}: ${line.value}`);
  });
  doc.moveDown(1);
  doc.fontSize(10).fillColor('#666').text(args.footer || 'This is a system-generated document.');
  doc.end();
}

export function paymentBreakdownLines(payment: any) {
  return [
    { label: 'Filing Fee', value: formatInr(Number(payment.filingFee || 0)) },
    { label: 'CA Service Fee', value: formatInr(Number(payment.caServiceFee || 0)) },
    { label: 'Platform Fee', value: formatInr(Number(payment.platformFee || 0)) },
    { label: 'Subtotal', value: formatInr(Number(payment.subtotal || 0)) },
    { label: 'CGST', value: formatInr(Number(payment.cgst || 0)) },
    { label: 'SGST', value: formatInr(Number(payment.sgst || 0)) },
    { label: 'IGST', value: formatInr(Number(payment.igst || 0)) },
    { label: 'Total GST', value: formatInr(Number(payment.totalGst || 0)) },
    { label: 'Grand Total', value: formatInr(Number(payment.amount || 0)) },
  ];
}
