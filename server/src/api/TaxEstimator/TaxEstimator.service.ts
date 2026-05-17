import { TaxInput, TaxOutput, TaxCalendarInput } from "./TaxEstimator.types";
import { TaxEstimatorModel, TaxCalendarModel } from "./TaxEstimator.model";

export class TaxEstimatorService {
  // ----- Tax Estimation Logic -----
  static async calculateTax(data: TaxInput): Promise<TaxOutput> {
    const { income, deductions = 0 } = data;

    const taxableIncome = income - deductions;
    let taxAmount = 0;

    // Basic India-like tax slab logic
    if (taxableIncome <= 250000) taxAmount = 0;
    else if (taxableIncome <= 500000)
      taxAmount = (taxableIncome - 250000) * 0.05;
    else if (taxableIncome <= 1000000)
      taxAmount = 12500 + (taxableIncome - 500000) * 0.2;
    else taxAmount = 112500 + (taxableIncome - 1000000) * 0.3;

    const effectiveTaxRate = (taxAmount / income) * 100;

    // Save record
    await TaxEstimatorModel.create({
      income,
      deductions,
      taxAmount,
      taxYear: data.taxYear || new Date().getFullYear(),
    });

    return { taxableIncome, taxAmount, effectiveTaxRate };
  }

  static async getAllTaxRecords() {
    return TaxEstimatorModel.find().sort({ createdAt: -1 });
  }

  // ----- Tax Calendar Logic -----
  static async addCalendarEvent(event: TaxCalendarInput) {
    return TaxCalendarModel.create(event);
  }

  static async syncQuarterlyReminders() {
    const dt = new Date();
    // Midnight to avoid timezone shift matches incorrectly
    dt.setHours(0, 0, 0, 0);

    const year = dt.getFullYear();
    const isJanToMar = dt.getMonth() < 3;
    const fyStart = isJanToMar ? year - 1 : year; // Indian FY Year (April - March)

    // Mark outdated upcoming items as expired
    await TaxCalendarModel.updateMany(
      { dueDate: { $lt: dt }, status: 'upcoming' },
      { $set: { status: 'expired' } }
    );

    const quarters = [
      { title: "Q1 Advance Tax Payment", date: new Date(Date.UTC(fyStart, 5, 15)) }, // 15 June
      { title: "Q2 Advance Tax Payment", date: new Date(Date.UTC(fyStart, 8, 15)) }, // 15 Sept
      { title: "Q3 Advance Tax Payment", date: new Date(Date.UTC(fyStart, 11, 15)) }, // 15 Dec
      { title: "Q4 Advance Tax Payment", date: new Date(Date.UTC(fyStart + 1, 2, 15)) }, // 15 Mar
    ];

    for (const q of quarters) {
      const existing = await TaxCalendarModel.findOne({ title: q.title, dueDate: q.date });
      if (!existing) {
        await TaxCalendarModel.create({
          title: q.title,
          dueDate: q.date,
          description: `Due date for ${q.title.split(' ')[0]} advance tax`,
          status: q.date < dt ? 'expired' : 'upcoming'
        });
      }
    }
  }

  static async getAllCalendarEvents() {
    await this.syncQuarterlyReminders();
    return TaxCalendarModel.find().sort({ dueDate: 1 });
  }

  static async markCalendarEventPaid(id: string) {
    return TaxCalendarModel.findByIdAndUpdate(id, { status: 'paid' }, { new: true });
  }

  static async deleteCalendarEvent(id: string) {
    return TaxCalendarModel.findByIdAndDelete(id);
  }

  // ✅ NEW: bulk delete reminders (title begins with "Reminder")
  static async deleteAllReminders() {
    // Using a title convention we already rely on in the UI
    const res = await TaxCalendarModel.deleteMany({ title: { $regex: /^Reminder/i } });
    return res.deletedCount ?? 0;
  }
}
