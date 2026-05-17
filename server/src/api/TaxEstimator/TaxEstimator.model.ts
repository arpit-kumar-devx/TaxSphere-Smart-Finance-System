import mongoose, { Schema, Document } from "mongoose";
import { TaxInput, TaxCalendarInput } from "./TaxEstimator.types";

export interface TaxRecord extends TaxInput, Document {
  taxAmount: number;
  createdAt: Date;
}

export interface TaxCalendarRecord extends TaxCalendarInput, Document {
  status: 'upcoming' | 'paid' | 'expired';
  createdAt: Date;
}

const TaxEstimatorSchema = new Schema<TaxRecord>({
  income: { type: Number, required: true },
  deductions: { type: Number, default: 0 },
  taxYear: { type: Number, default: new Date().getFullYear() },
  taxAmount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

const TaxCalendarSchema = new Schema<TaxCalendarRecord>({
  title: { type: String, required: true },
  dueDate: { type: Date, required: true },
  description: { type: String },
  status: { type: String, enum: ['upcoming', 'paid', 'expired'], default: 'upcoming' },
  createdAt: { type: Date, default: Date.now },
});

export const TaxEstimatorModel = mongoose.model<TaxRecord>(
  "TaxEstimator",
  TaxEstimatorSchema
);

export const TaxCalendarModel = mongoose.model<TaxCalendarRecord>(
  "TaxCalendar",
  TaxCalendarSchema
);