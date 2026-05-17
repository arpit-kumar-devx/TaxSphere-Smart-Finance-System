import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    fileUrl: { type: String, required: true },
    fileName: { type: String },
    type: {
      type: String,
      enum: ['Form16', 'BankStatement', 'PAN', 'Aadhaar', 'InvestmentProof', 'Other'],
      default: 'Other',
    },
    status: {
      type: String,
      enum: ['pending', 'uploaded', 'verified', 'rejected'],
      default: 'pending',
      lowercase: true,
      trim: true,
    },
    remarks: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const itrSchema = new mongoose.Schema(
  {
    taxPayable: { type: Number, default: 0, min: 0 },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    assignedCaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    assessmentYear: { type: String, required: true, trim: true },
    financialYear: { type: String, required: true, trim: true },
    regime: { type: String, enum: ['OLD', 'NEW'], required: true },

    personalInfo: {
      firstName: { type: String, default: '' },
      lastName: { type: String, default: '' },
      /** Format checked in submitForPayment — not here, or partial PAN while editing causes save() to fail. */
      pan: {
        type: String,
        uppercase: true,
        trim: true,
        maxlength: 10,
      },
      mobile: { type: String, default: '' },
      email: { type: String, default: '' },
    },

    income: {
      salary: { type: Number, default: 0, min: 0 },
      business: { type: Number, default: 0, min: 0 },
      capitalGains: { type: Number, default: 0, min: 0 },
      otherIncome: { type: Number, default: 0, min: 0 },
      totalIncome: { type: Number, default: 0, min: 0 },
    },

    deductions: {
      c80C: { type: Number, default: 0, min: 0 },
      c80D: { type: Number, default: 0, min: 0 },
      c80E: { type: Number, default: 0, min: 0 },
      c80G: { type: Number, default: 0, min: 0 },
      nps: { type: Number, default: 0, min: 0 },
      totalDeductions: { type: Number, default: 0, min: 0 },
    },

    taxSummary: {
      taxableIncome: { type: Number, default: 0 },
      taxBeforeRebate: { type: Number, default: 0 },
      rebate87A: { type: Number, default: 0 },
      cess: { type: Number, default: 0 },
      finalTax: { type: Number, default: 0 },
    },

    payment: {
      orderId: { type: String },
      paymentId: { type: String },
      amount: { type: Number },
      currency: { type: String, default: 'INR' },
      paymentStatus: {
        type: String,
        enum: ['not_required', 'pending', 'created', 'paid', 'failed', 'refunded'],
        default: 'not_required',
      },
      paidAt: { type: Date },
    },

    documents: [documentSchema],

    filingStatus: {
      type: String,
      enum: [
        'draft',
        'submitted',
        'assigned',
        'under_review',
        'approved',
        'rejected',
        'payment_pending',
        'payment_completed',
        'filed'
      ],
      default: 'draft',
      lowercase: true,
      trim: true,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['not_required', 'pending', 'created', 'paid', 'failed', 'refunded'],
      default: 'not_required',
      lowercase: true,
      trim: true,
      index: true,
    },
    // Backward compatibility for existing code paths.
    status: {
      type: String,
      enum: [
        'draft',
        'submitted',
        'assigned',
        'under_review',
        'approved',
        'rejected',
        'payment_pending',
        'payment_completed',
        'filed'
      ],
      default: 'draft',
      lowercase: true,
      trim: true,
      index: true,
    },

    caRemarks: { type: String, default: '' },
    paymentId: { type: String, default: '' },
    paymentAmount: { type: Number, default: 0, min: 0 },
    paidAt: { type: Date },
    filedAt: { type: Date },
  },
  { timestamps: true }
);

itrSchema.pre('save', function (next) {
  if ((this as any).filingStatus) {
    (this as any).filingStatus = String((this as any).filingStatus).toLowerCase().trim();
    (this as any).status = (this as any).filingStatus;
  } else if ((this as any).status) {
    (this as any).status = String((this as any).status).toLowerCase().trim();
    (this as any).filingStatus = (this as any).status;
  }
  if ((this as any).paymentStatus) {
    (this as any).paymentStatus = String((this as any).paymentStatus).toLowerCase().trim();
  }
  if ((this as any).payment && (this as any).payment.paymentStatus) {
    (this as any).payment.paymentStatus = String((this as any).payment.paymentStatus).toLowerCase().trim();
    (this as any).paymentStatus = (this as any).payment.paymentStatus;
  }
  if (this.documents && Array.isArray(this.documents)) {
    this.documents.forEach((doc: any) => {
      if (doc.status) {
        doc.status = String(doc.status).toLowerCase().trim();
      }
    });
  }
  next();
});

itrSchema.index({ userId: 1, assessmentYear: 1 });

export type ItrDocument = mongoose.InferSchemaType<typeof documentSchema>;
export type Itr = mongoose.InferSchemaType<typeof itrSchema> & {
  _id: mongoose.Types.ObjectId;
};

export default mongoose.model('Itr', itrSchema);
