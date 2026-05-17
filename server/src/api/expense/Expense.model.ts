import { Schema, model } from 'mongoose';

const ExpenseSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    description: { type: String, required: true, alias: 'source' },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, required: true },
    date: { type: Date, required: true, default: () => new Date() },
    notes: { type: String }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Helpful for dashboard queries & recent lists
ExpenseSchema.index({ userId: 1, date: -1 });

export default model('Expense', ExpenseSchema);
