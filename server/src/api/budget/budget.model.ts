import mongoose, { Schema, Document, Types, Model } from 'mongoose';

export interface IBudgetCategory {
  name: string;
  limit: number;
  spent: number;
}

export interface IBudget extends Document {
  userId: Types.ObjectId;
  month: string; // "YYYY-MM"
  totalBudget: number;
  categories: IBudgetCategory[];
  createdAt: Date;
  updatedAt: Date;
}

const BudgetCategorySchema = new Schema<IBudgetCategory>({
  name: { type: String, required: true, trim: true },
  limit: { type: Number, required: true, min: 0 },
  spent: { type: Number, default: 0, min: 0 }
}, { _id: false });

const BudgetSchema = new Schema<IBudget>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    month: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be in YYYY-MM format']
    },
    totalBudget: { type: Number, required: true, min: 0 },
    categories: { type: [BudgetCategorySchema], default: [] }
  },
  { timestamps: true }
);

// One budget document per user per month
BudgetSchema.index({ userId: 1, month: 1 }, { unique: true });

export const Budget: Model<IBudget> =
  (mongoose.models.Budget as Model<IBudget>) ||
  mongoose.model<IBudget>('Budget', BudgetSchema);

export default Budget;
