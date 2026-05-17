import { Schema, model, Types, Document } from 'mongoose';

export interface TransactionDoc extends Document {
  userId: Types.ObjectId;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description?: string;
  source?: 'manual' | 'payment';
  sourceRef?: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<TransactionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    source: { type: String, enum: ['manual', 'payment'], default: 'manual' },
    sourceRef: { type: String, trim: true },
    date: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// Ensure amount is definitely a number before saving to prevent high-value calculation bugs
TransactionSchema.pre('save', function (next) {
  if (this.amount !== undefined && this.amount !== null) {
    this.amount = Number(this.amount);
  }
  next();
});

TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, type: 1, date: -1 });
TransactionSchema.index({ userId: 1, source: 1, sourceRef: 1 }, { sparse: true });

const Transaction = model<TransactionDoc>('Transaction', TransactionSchema);
export default Transaction;
