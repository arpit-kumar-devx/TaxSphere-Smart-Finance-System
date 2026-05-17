import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  userId: mongoose.Types.ObjectId;
  itrId: mongoose.Types.ObjectId;
  assignedCaId?: mongoose.Types.ObjectId | null;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  amount: number;
  amountRupees?: number;
  filingFee: number;
  filingFeeRupees?: number;
  caServiceFee: number;
  caServiceFeeRupees?: number;
  platformFee: number;
  platformFeeRupees?: number;
  subtotal: number;
  subtotalRupees?: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  totalGstRupees?: number;
  userState?: string;
  currency: string;
  paidAt?: Date;
  failureReason?: string;
  status: 'pending' | 'created' | 'paid' | 'failed' | 'refunded';
}

const paymentSchema = new Schema<IPayment>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  itrId: { type: Schema.Types.ObjectId, ref: 'Itr', required: true, index: true },
  assignedCaId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  razorpayOrderId: { type: String, required: true, index: true, unique: true },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  amount: { type: Number, required: true },
  amountRupees: { type: Number, default: 0 },
  filingFee: { type: Number, required: true, default: 0 },
  filingFeeRupees: { type: Number, default: 0 },
  caServiceFee: { type: Number, required: true, default: 0 },
  caServiceFeeRupees: { type: Number, default: 0 },
  platformFee: { type: Number, required: true, default: 0 },
  platformFeeRupees: { type: Number, default: 0 },
  subtotal: { type: Number, required: true, default: 0 },
  subtotalRupees: { type: Number, default: 0 },
  gstRate: { type: Number, required: true, default: 0 },
  cgst: { type: Number, required: true, default: 0 },
  sgst: { type: Number, required: true, default: 0 },
  igst: { type: Number, required: true, default: 0 },
  totalGst: { type: Number, required: true, default: 0 },
  totalGstRupees: { type: Number, default: 0 },
  userState: { type: String, default: '' },
  currency: { type: String, default: 'INR' },
  paidAt: { type: Date },
  failureReason: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'created', 'paid', 'failed', 'refunded'], default: 'pending' }
}, { timestamps: true });

export default mongoose.model<IPayment>('Payment', paymentSchema);
