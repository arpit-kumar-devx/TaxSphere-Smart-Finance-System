import path from 'path';
import mongoose from 'mongoose';
import Itr from './itr.model';
import { calculateTax } from '../../utils/taxCalculator';
import User from '../auth/user.model';
import Payment from '../payment/payment.model';
import { io } from '../../server';
import { sendItrStatusEmail } from '../../utils/mailer';
import Notification from '../notification/notification.model';

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function nonNeg(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) && x >= 0 ? x : 0;
}

function rollupIncomeIncome(doc: any) {
  if (!doc.income) doc.set('income', {});
  const i = doc.income;
  i.salary = nonNeg(i.salary);
  i.business = nonNeg(i.business);
  i.capitalGains = nonNeg(i.capitalGains);
  i.otherIncome = nonNeg(i.otherIncome);
  doc.income.totalIncome = i.salary + i.business + i.capitalGains + i.otherIncome;
}

function rollupDeductions(doc: any) {
  if (!doc.deductions) doc.set('deductions', {});
  const d = doc.deductions;
  d.c80C = nonNeg(d.c80C);
  d.c80D = nonNeg(d.c80D);
  d.c80E = nonNeg(d.c80E);
  d.c80G = nonNeg(d.c80G);
  d.nps = nonNeg(d.nps);
  doc.deductions.totalDeductions = d.c80C + d.c80D + d.c80E + d.c80G + d.nps;
}

function ensureTaxSummary(itr: any) {
  if (!itr.taxSummary) {
    itr.set('taxSummary', {
      taxableIncome: 0,
      taxBeforeRebate: 0,
      rebate87A: 0,
      cess: 0,
      finalTax: 0,
    });
  }
}

export const itrService = {
  async create(userId: string, body: Partial<{ assessmentYear: string; financialYear: string; regime: 'OLD' | 'NEW' }>) {
    const itr = await Itr.create({
      userId,
      assessmentYear: body.assessmentYear || '2024-25',
      financialYear: body.financialYear || '2023-24',
      regime: body.regime || 'NEW',
    });
    return itr;
  },

  async listForUser(userId: string) {
    return Itr.find({ userId }).sort({ updatedAt: -1 }).lean();
  },

  async getById(id: string, userId?: string, role?: string) {
    const q: any = { _id: id };
    if (role === 'USER' && userId) q.userId = userId;
    return Itr.findOne(q).lean();
  },

  async getByIdAny(id: string) {
    return Itr.findById(id).lean();
  },

  async getByIdForCa(id: string, caUserId: string) {
    return Itr.findOne({
      _id: id,
      assignedCaId: caUserId,
    }).lean();
  },

  async updateDraft(id: string, userId: string, patch: Record<string, unknown>) {
    const itr = await Itr.findOne({ _id: id, userId });
    if (!itr) return null;
    if (!['draft', 'payment_pending'].includes(itr.status)) {
      throw new Error('NOT_EDITABLE');
    }

    if (patch.personalInfo && typeof patch.personalInfo === 'object') {
      if (!itr.personalInfo) itr.set('personalInfo', {} as any);
      Object.assign(itr.personalInfo as object, patch.personalInfo as object);
      const pan = (itr.personalInfo as any).pan;
      if (pan && typeof pan === 'string') (itr.personalInfo as any).pan = pan.toUpperCase().trim();
    }
    if (patch.income && typeof patch.income === 'object') {
      if (!itr.income) itr.set('income', {} as any);
      Object.assign(itr.income as object, patch.income as object);
      rollupIncomeIncome(itr);
    }
    if (patch.deductions && typeof patch.deductions === 'object') {
      if (!itr.deductions) itr.set('deductions', {} as any);
      Object.assign(itr.deductions as object, patch.deductions as object);
      rollupDeductions(itr);
    }
    if (patch.regime === 'OLD' || patch.regime === 'NEW') itr.regime = patch.regime;
    if (typeof patch.assessmentYear === 'string') itr.assessmentYear = patch.assessmentYear;
    if (typeof patch.financialYear === 'string') itr.financialYear = patch.financialYear;

    await itr.save();
    return itr.toObject();
  },

  async applyTaxEngine(id: string, userId: string) {
    const itr = await Itr.findOne({ _id: id, userId });
    if (!itr) return null;

    rollupIncomeIncome(itr);
    rollupDeductions(itr);
    const inc = itr.income!;
    const ded = itr.deductions!;
    const summary = calculateTax(
      {
        salary: inc.salary,
        business: inc.business,
        capitalGains: inc.capitalGains,
        otherIncome: inc.otherIncome,
      },
      {
        c80C: ded.c80C,
        c80D: ded.c80D,
        c80E: ded.c80E,
        c80G: ded.c80G,
        nps: ded.nps,
      },
      itr.regime as 'OLD' | 'NEW'
    );

    inc.totalIncome = summary.totalIncome;
    ded.totalDeductions = summary.totalDeductions;
    ensureTaxSummary(itr);
    Object.assign(itr.taxSummary!, {
      taxableIncome: summary.taxableIncome,
      taxBeforeRebate: summary.taxBeforeRebate,
      rebate87A: summary.rebate87A,
      cess: summary.cess,
      finalTax: summary.finalTax,
    });
    await itr.save();
    return itr.toObject();
  },

  async submitForPayment(id: string, userId: string) {
    const itr = await Itr.findOne({ _id: id, userId });
    if (!itr) return null;
    if (!['draft', 'payment_pending'].includes(itr.status)) {
      throw new Error('INVALID_STATUS');
    }
    if (!itr.personalInfo) (itr as any).personalInfo = {};
    const panRaw = String((itr.personalInfo as any).pan || '').trim().toUpperCase();
    (itr.personalInfo as any).pan = panRaw;
    if (!PAN_RE.test(panRaw)) throw new Error('PAN_REQUIRED');
    const first = String((itr.personalInfo as any).firstName || '').trim();
    if (!first) throw new Error('NAME_REQUIRED');
    (itr.personalInfo as any).firstName = first;
    rollupIncomeIncome(itr);
    rollupDeductions(itr);
    const inc2 = itr.income!;
    const ded2 = itr.deductions!;
    const summary = calculateTax(
      {
        salary: nonNeg(inc2.salary),
        business: nonNeg(inc2.business),
        capitalGains: nonNeg(inc2.capitalGains),
        otherIncome: nonNeg(inc2.otherIncome),
      },
      {
        c80C: nonNeg(ded2.c80C),
        c80D: nonNeg(ded2.c80D),
        c80E: nonNeg(ded2.c80E),
        c80G: nonNeg(ded2.c80G),
        nps: nonNeg(ded2.nps),
      },
      itr.regime as 'OLD' | 'NEW'
    );
    ensureTaxSummary(itr);
    Object.assign(itr.taxSummary!, {
      taxableIncome: summary.taxableIncome,
      taxBeforeRebate: summary.taxBeforeRebate,
      rebate87A: summary.rebate87A,
      cess: summary.cess,
      finalTax: summary.finalTax,
    });

    console.log(`[ITR Service] Validating Eligibility for ${id}. Final Tax: ${summary.finalTax}`);

    // CHECK: Tax Liability
    if (summary.finalTax <= 0) {
      throw new Error('NO_TAX_DUE');
    }

    // CHECK: Required Documents (PAN, Aadhaar, Form16)
    const hasPan = itr.documents.some(d => d.type === 'PAN');
    const hasAadhaar = itr.documents.some(d => d.type === 'Aadhaar');
    const hasForm16 = itr.documents.some(d => d.type === 'Form16');
    
    if (!hasPan || !hasAadhaar || !hasForm16) {
      console.warn(`[ITR Service] Missing Docs for ${id}. PAN:${hasPan}, Aadhaar:${hasAadhaar}, Form16:${hasForm16}`);
      throw new Error('DOCS_REQUIRED');
    }

    itr.status = 'payment_pending';
    (itr as any).filingStatus = 'payment_pending';
    (itr as any).paymentStatus = 'pending';
    itr.set('payment.paymentStatus', 'pending');
    itr.set('payment.orderId', undefined);
    itr.set('payment.paymentId', undefined);
    (itr as any).paymentId = '';
    (itr as any).paymentAmount = 0;
    (itr as any).paidAt = undefined;
    await itr.save();

    // Notify user of submission
    const user = await User.findById(userId).lean();
    if (user && user.email) {
      await sendItrStatusEmail(user.email, user.name, String(itr._id), 'payment_pending');
    }

    return itr.toObject();
  },

  async addDocument(
    itrId: string,
    userId: string,
    diskPath: string,
    originalName: string,
    docType: string
  ) {
    const itr = await Itr.findOne({ _id: itrId, userId });
    if (!itr) return null;
    if (!['draft', 'payment_pending', 'payment_completed', 'submitted', 'under_review'].includes(itr.status)) {
      throw new Error('NOT_UPLOADABLE');
    }
    const fileName = path.basename(diskPath);
    const fileUrl = `/uploads/itr-docs/${fileName}`;
    
    // Check for existing doc of same type and replace
    const existingIndex = itr.documents.findIndex((d: any) => d.type === docType);
    const newDoc = {
      fileUrl,
      fileName: originalName,
      type: docType as any,
      status: 'uploaded' as const,
      uploadedAt: new Date()
    };

    if (existingIndex > -1) {
      itr.documents[existingIndex] = newDoc as any;
    } else {
      itr.documents.push(newDoc as any);
    }

    await itr.save();
    return itr.toObject();
  },

  async markPaid(itrId: string, orderId: string, paymentId: string, amount: number) {
    const itr = await Itr.findById(itrId);
    if (!itr) return null;
    if (itr.status !== 'payment_pending') throw new Error('INVALID_STATUS');
    itr.payment = {
      orderId,
      paymentId,
      amount,
      currency: 'INR',
      paymentStatus: 'paid',
      paidAt: new Date(),
    };
    itr.status = 'payment_completed';
    (itr as any).filingStatus = 'payment_completed';
    (itr as any).paymentStatus = 'paid';
    (itr as any).paymentId = paymentId;
    (itr as any).paymentAmount = amount;
    (itr as any).paidAt = new Date();
    await itr.save();

    // Create separate Payment record for audit
    await Payment.create({
      userId: itr.userId,
      itrId: itr._id,
      amount,
      currency: 'INR',
      status: 'paid',
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
    });

    const out = itr.toObject();
    io.emit('paymentUpdated', {
      itrId: out._id,
      userId: out.userId,
      amount,
      status: out.status,
      payment: out.payment,
    });
    return out;
  },

  async listForCa(caUserId: string) {
    return Itr.find({ assignedCaId: caUserId })
      .sort({ updatedAt: -1 })
      .populate('userId', 'name email')
      .lean();
  },

  async listAll() {
    return Itr.find({})
      .sort({ updatedAt: -1 })
      .populate('userId', 'name email role')
      .populate('assignedCaId', 'name email')
      .lean();
  },

  async assignCa(itrId: string, caUserId: string) {
    const ca = await User.findOne({ _id: caUserId, role: 'CA' });
    if (!ca) throw new Error('INVALID_CA');
    const itr = await Itr.findById(itrId);
    if (!itr) return null;

    // Normalizing existing documents before save (handles legacy case-sensitive values)
    if (itr.documents && Array.isArray(itr.documents)) {
      itr.documents = (itr.documents as any).map((doc: any) => {
        const d = doc.toObject ? doc.toObject() : doc;
        return {
          ...d,
          status: String(d.status || 'pending').toLowerCase().trim()
        };
      });
    }

    itr.assignedCaId = new mongoose.Types.ObjectId(caUserId);
    itr.status = 'assigned';
    await itr.save();
    return itr.toObject();
  },

  async updateDocumentStatus(
    itrId: string,
    docId: string,
    caUserId: string,
    status: 'verified' | 'rejected',
    remarks?: string
  ) {
    const itr = await Itr.findOne({ _id: itrId, assignedCaId: caUserId });
    if (!itr) return null;
    const doc = itr.documents.id(docId);
    if (!doc) return null;
    doc.status = status;
    doc.remarks = remarks || '';
    doc.reviewedAt = new Date();
    doc.reviewedBy = new mongoose.Types.ObjectId(caUserId) as any;
    await itr.save();
    return itr.toObject();
  },

  async setItrStatusByCa(
    itrId: string,
    caUserId: string,
    status: 'submitted' | 'assigned' | 'under_review' | 'approved' | 'rejected' | 'payment_pending' | 'payment_completed' | 'filed',
    caRemarks?: string
  ) {
    const itr = await Itr.findOne({ _id: itrId, assignedCaId: caUserId });
    if (!itr) return null;

    if (status === 'filed') {
      const paymentStatus = String((itr as any).paymentStatus || itr.payment?.paymentStatus || '').toLowerCase();
      if (paymentStatus !== 'paid') throw new Error('INVALID_TRANSITION');
    } else if (status === 'approved') {
      const pending = itr.documents.some((d: { status: string }) => d.status === 'pending');
      if (pending) throw new Error('DOCUMENTS_PENDING');
      const rejected = itr.documents.filter((d: { status: string }) => d.status === 'rejected');
      if (rejected.length) throw new Error('HAS_REJECTED_DOCS');
    } else if (status === 'under_review') {
      if (!['assigned', 'under_review'].includes(itr.status)) throw new Error('INVALID_TRANSITION');
    }

    if (status === 'approved') {
      (itr as any).filingStatus = 'approved';
      (itr as any).status = 'approved';
      await Notification.create({
        userId: itr.userId,
        title: 'ITR approved by CA',
        message: 'Your ITR has been approved by CA and is ready for final filing.',
        type: 'INFO',
      });
    } else if (status === 'rejected') {
      const currentPaymentStatus = String((itr as any).paymentStatus || itr.payment?.paymentStatus || 'not_required').toLowerCase();
      const nextPaymentStatus = currentPaymentStatus === 'paid' ? 'paid' : 'not_required';
      (itr as any).filingStatus = 'rejected';
      (itr as any).status = 'rejected';
      (itr as any).paymentStatus = nextPaymentStatus;
      itr.set('payment.paymentStatus', nextPaymentStatus);
    } else if (status === 'filed') {
      (itr as any).filingStatus = 'filed';
      (itr as any).status = 'filed';
      (itr as any).filedAt = new Date();
    } else {
      (itr as any).filingStatus = status;
      (itr as any).status = status;
    }
    
    if (typeof caRemarks === 'string') itr.caRemarks = caRemarks;
    await itr.save();

    // Notify user of approval/filing
    const user = await User.findById(itr.userId).lean();
    if (user && user.email) {
      const emailStatus = status === 'filed' ? 'Approved & Filed' : status;
      await sendItrStatusEmail(user.email, user.name, String(itr._id), emailStatus);
    }

    const out = itr.toObject();
    io.emit('itrUpdated', {
      id: out._id,
      userId: out.userId,
      status: out.status,
      caRemarks: out.caRemarks,
    });
    return out;
  },

  async submitFree(id: string, userId: string) {
    const itr = await Itr.findOne({ _id: id, userId });
    if (!itr) return null;
    
    // Recalculate tax to ensure it's actually zero
    const summary = calculateTax(
      {
        salary: nonNeg(itr.income?.salary),
        business: nonNeg(itr.income?.business),
        capitalGains: nonNeg(itr.income?.capitalGains),
        otherIncome: nonNeg(itr.income?.otherIncome),
      },
      {
        c80C: nonNeg(itr.deductions?.c80C),
        c80D: nonNeg(itr.deductions?.c80D),
        c80E: nonNeg(itr.deductions?.c80E),
        c80G: nonNeg(itr.deductions?.c80G),
        nps: nonNeg(itr.deductions?.nps),
      },
      itr.regime as 'OLD' | 'NEW'
    );

    if (summary.finalTax > 0) {
      throw new Error('PAYMENT_REQUIRED');
    }

    // Required Docs check same as submitForPayment
    const hasPan = itr.documents.some(d => d.type === 'PAN');
    const hasAadhaar = itr.documents.some(d => d.type === 'Aadhaar');
    if (!hasPan || !hasAadhaar) throw new Error('DOCS_REQUIRED');

    itr.status = 'payment_completed'; // Mark as "Paid" (Free)
    (itr as any).filingStatus = 'payment_completed';
    (itr as any).paymentStatus = 'paid';
    itr.payment = {
      amount: 0,
      currency: 'INR',
      paymentStatus: 'paid',
      paidAt: new Date(),
    };
    await itr.save();

    return itr.toObject();
  },
};
