import crypto from 'crypto';
import Razorpay from 'razorpay';

const keyId = process.env.RAZORPAY_KEY_ID || '';
const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
const paymentCurrency = (process.env.PAYMENT_CURRENCY || 'INR').toUpperCase();

function getClient(): Razorpay {
  if (!keyId || !keySecret) {
    throw new Error('RAZORPAY_NOT_CONFIGURED');
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export function getRazorpayKeyId(): string {
  return keyId;
}

export function getPaymentCurrency(): string {
  return paymentCurrency;
}

function parseInrAmount(raw: string, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getFeeConfig() {
  const filingFee = parseInrAmount(process.env.ITR_FILING_FEE || '499', 499);
  const caServiceFee = parseInrAmount(process.env.CA_SERVICE_FEE || '999', 999);
  const platformFee = parseInrAmount(process.env.PLATFORM_FEE || '99', 99);
  return { filingFee, caServiceFee, platformFee };
}

export function buildAmountPaise() {
  const { filingFee, caServiceFee, platformFee } = getFeeConfig();
  const totalInr = filingFee + caServiceFee + platformFee;
  return {
    filingFee,
    caServiceFee,
    platformFee,
    amountInr: totalInr,
    amountPaise: Math.round(totalInr * 100),
  };
}

export function createRazorpayOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }) {
  const client = getClient();
  return client.orders.create({
    amount: input.amountPaise,
    currency: paymentCurrency,
    receipt: input.receipt.slice(0, 40),
    notes: input.notes || {},
  });
}

export function verifySignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!keySecret) return false;
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
