import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import CaCommission from '../api/payment/ca-commission.model';
import '../api/payment/payment.model';
import { normalizeCommissionAmountRupees } from '../api/payment/payment.helpers';

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'server/.env'),
  path.resolve(__dirname, '../../.env'),
];

for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

function almostEqual(a: number, b: number): boolean {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= 0.009;
}

async function run(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/taxsphere';
  await mongoose.connect(mongoUri);
  console.log('[migration] Connected to MongoDB');

  const rows = await CaCommission.find({})
    .populate('paymentId', 'caServiceFee')
    .select('commissionAmount caServiceFee paymentId')
    .lean();

  let scanned = 0;
  let fixed = 0;

  for (const row of rows as any[]) {
    scanned += 1;
    const normalized = normalizeCommissionAmountRupees({
      commissionAmount: row.commissionAmount,
      caServiceFee: row.caServiceFee,
      paymentCaServiceFee: row.paymentId?.caServiceFee,
    });

    const update: Record<string, number> = {};
    if (!almostEqual(Number(row.caServiceFee || 0), normalized.caServiceFee)) {
      update.caServiceFee = normalized.caServiceFee;
    }
    if (!almostEqual(Number(row.commissionAmount || 0), normalized.commissionAmount)) {
      update.commissionAmount = normalized.commissionAmount;
    }

    if (Object.keys(update).length > 0) {
      await CaCommission.updateOne({ _id: row._id }, { $set: update });
      fixed += 1;
      console.log('[migration] corrected', {
        id: String(row._id),
        from: {
          caServiceFee: row.caServiceFee,
          commissionAmount: row.commissionAmount,
        },
        to: update,
      });
    }
  }

  console.log('[migration] completed', { scanned, fixed });
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('[migration] failed:', err?.message || err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
