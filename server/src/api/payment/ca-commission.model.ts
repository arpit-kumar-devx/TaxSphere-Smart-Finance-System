import mongoose, { Schema, Document } from 'mongoose';

export interface ICaCommission extends Document {
  caId: mongoose.Types.ObjectId;
  itrId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  paymentId: mongoose.Types.ObjectId;
  caServiceFee: number;
  commissionAmount: number;
  commissionType: 'percentage' | 'fixed';
  commissionPercent: number;
  status: 'credited' | 'pending_payout' | 'paid_out';
  creditedAt?: Date;
  payoutDate?: Date;
}

const caCommissionSchema = new Schema<ICaCommission>(
  {
    caId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    itrId: { type: Schema.Types.ObjectId, ref: 'Itr', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    caServiceFee: { type: Number, required: true, default: 0 },
    commissionAmount: { type: Number, required: true, default: 0 },
    commissionType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    commissionPercent: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['credited', 'pending_payout', 'paid_out'], default: 'credited' },
    creditedAt: { type: Date },
    payoutDate: { type: Date },
  },
  { timestamps: true }
);

caCommissionSchema.index({ caId: 1, itrId: 1 }, { unique: true });

export default mongoose.model<ICaCommission>('CaCommission', caCommissionSchema);
