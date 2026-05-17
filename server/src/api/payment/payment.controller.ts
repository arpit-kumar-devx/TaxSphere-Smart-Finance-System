import { Response } from 'express';
import { AuthedRequest } from '../auth/auth';
import Itr from '../itr/itr.model';
import { buildAmountPaise, createRazorpayOrder, getPaymentCurrency, getRazorpayKeyId, verifySignature } from './payment.service';
import Payment from './payment.model';
import Notification from '../notification/notification.model';
import AuditLog from '../audit/audit.model';
import User from '../auth/user.model';
import CaCommission from './ca-commission.model';
import { buildCommission, calculateGstBreakdown, normalizeCommissionAmountRupees, paymentBreakdownLines, sendPaymentPdf } from './payment.helpers';
import Transaction from '../transaction/Transaction.model';
import { io } from '../../server';

export async function getPaymentConfig(_req: AuthedRequest, res: Response) {
  return res.json({
    success: true,
    keyId: getRazorpayKeyId(),
    currency: getPaymentCurrency(),
  });
}

export async function createItrOrder(req: AuthedRequest, res: Response) {
  try {
    const userId = String(req.user!.userId);
    const itrId = String(req.params.itrId || '');
    const itr = await Itr.findOne({ _id: itrId, userId });
    if (!itr) return res.status(404).json({ success: false, message: 'ITR not found' });

    const filingStatus = String((itr as any).filingStatus || itr.status || '').toLowerCase();
    const paymentStatus = String((itr as any).paymentStatus || itr.payment?.paymentStatus || '').toLowerCase();
    if (filingStatus !== 'payment_pending') {
      return res.status(400).json({ success: false, message: 'ITR is not in payment pending state' });
    }
    if (!['pending', 'created', 'failed'].includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Payment is not allowed in current state' });
    }

    if (paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'ITR already paid' });
    }
    const amountInfo = buildAmountPaise();
    const user = await User.findById(userId).select('country state').lean();
    const gst = calculateGstBreakdown({
      subtotalPaise: amountInfo.amountPaise,
      userState: (user as any)?.state || (user as any)?.country || '',
    });
    const totalAmountPaise = amountInfo.amountPaise + gst.totalGst;
    if (!Number.isFinite(totalAmountPaise) || totalAmountPaise <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero' });
    }
    const order = await createRazorpayOrder({
      amountPaise: totalAmountPaise,
      receipt: `itr_${itrId}_${Date.now()}`,
      notes: { itrId: String(itr._id), userId },
    });

    await Payment.create({
      userId,
      itrId: itr._id,
      assignedCaId: (itr as any).assignedCaId || null,
      amount: totalAmountPaise,
      amountRupees: Number((totalAmountPaise / 100).toFixed(2)),
      currency: getPaymentCurrency(),
      filingFee: Math.round(amountInfo.filingFee * 100),
      filingFeeRupees: amountInfo.filingFee,
      caServiceFee: Math.round(amountInfo.caServiceFee * 100),
      caServiceFeeRupees: amountInfo.caServiceFee,
      platformFee: Math.round(amountInfo.platformFee * 100),
      platformFeeRupees: amountInfo.platformFee,
      subtotal: amountInfo.amountPaise,
      subtotalRupees: amountInfo.amountInr,
      gstRate: gst.gstRate,
      cgst: gst.cgst,
      sgst: gst.sgst,
      igst: gst.igst,
      totalGst: gst.totalGst,
      totalGstRupees: Number((gst.totalGst / 100).toFixed(2)),
      userState: (user as any)?.state || (user as any)?.country || '',
      razorpayOrderId: order.id,
      status: 'created',
    });

    (itr as any).paymentStatus = 'created';
    (itr as any).paymentAmount = totalAmountPaise;
    itr.set('payment.orderId', order.id);
    itr.set('payment.amount', totalAmountPaise);
    itr.set('payment.currency', getPaymentCurrency());
    itr.set('payment.paymentStatus', 'created');
    await itr.save();

    return res.json({
      success: true,
      keyId: getRazorpayKeyId(),
      orderId: order.id,
      amount: totalAmountPaise,
      currency: getPaymentCurrency(),
      itrId: String(itr._id),
      breakdown: {
        filingFee: Math.round(amountInfo.filingFee * 100),
        caServiceFee: Math.round(amountInfo.caServiceFee * 100),
        platformFee: Math.round(amountInfo.platformFee * 100),
        subtotal: amountInfo.amountPaise,
        cgst: gst.cgst,
        sgst: gst.sgst,
        igst: gst.igst,
        totalGst: gst.totalGst,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message || 'Failed to create payment order' });
  }
}

export async function verifyItrPayment(req: AuthedRequest, res: Response) {
  try {
    const userId = String(req.user!.userId);
    const itrId = String(req.params.itrId || '');
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as Record<string, string>;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    const payment = await Payment.findOne({ itrId, userId, razorpayOrderId: razorpay_order_id });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment order not found' });

    const itr = await Itr.findOne({ _id: itrId, userId });
    if (!itr) return res.status(404).json({ success: false, message: 'ITR not found' });

    const isValid = verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      payment.status = 'failed';
      payment.failureReason = 'Invalid signature';
      await payment.save();
      (itr as any).paymentStatus = 'failed';
      itr.set('payment.paymentStatus', 'failed');
      await itr.save();
      return res.status(400).json({ success: false, message: 'Invalid Razorpay signature' });
    }

    payment.status = 'paid';
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.paidAt = new Date();
    await payment.save();

    if ((itr as any).assignedCaId) {
      const commission = buildCommission(Number(payment.caServiceFee || 0));
      if (process.env.NODE_ENV !== 'production') {
        console.log('[commission][verify]', {
          totalAmount: payment.amount,
          caServiceFee: payment.caServiceFee,
          commissionPercent: commission.commissionPercent,
          calculatedCommission: commission.commissionAmount,
        });
      }
      try {
        await CaCommission.findOneAndUpdate(
          { caId: (itr as any).assignedCaId, itrId: itr._id },
          {
            caId: (itr as any).assignedCaId,
            itrId: itr._id,
            userId: itr.userId,
            paymentId: payment._id,
            caServiceFee: commission.caServiceFeeRupees,
            commissionAmount: commission.commissionAmount,
            commissionType: commission.commissionType,
            commissionPercent: commission.commissionPercent,
            status: 'credited',
            creditedAt: new Date(),
          },
          { upsert: true, new: true }
        );
      } catch (err: any) {
        await AuditLog.create({
          adminId: req.user!.userId,
          action: 'COMMISSION_CREDIT_FAILED',
          targetType: 'Itr',
          targetId: String(itr._id),
          details: err?.message || 'Commission credit failed',
          severity: 'high',
        });
      }
    }

    (itr as any).paymentStatus = 'paid';
    (itr as any).filingStatus = 'payment_completed';
    (itr as any).status = 'payment_completed';
    (itr as any).paymentId = razorpay_payment_id;
    (itr as any).paymentAmount = payment.amount;
    (itr as any).paidAt = new Date();
    itr.set('payment.orderId', razorpay_order_id);
    itr.set('payment.paymentId', razorpay_payment_id);
    itr.set('payment.amount', payment.amount);
    itr.set('payment.currency', payment.currency);
    itr.set('payment.paymentStatus', 'paid');
    itr.set('payment.paidAt', new Date());
    await itr.save();

    // Sync payment as an expense transaction so budget analytics are real-time and complete.
    try {
      const userObjectId = (itr as any).userId;
      const sourceRef = `payment:${String(razorpay_payment_id || razorpay_order_id || payment._id)}`;
      const amountFromModel = Number(payment.amountRupees || 0);
      const fallbackAmount = Number(payment.amount || 0);
      const amountRupees = Number(
        (
          amountFromModel > 0
            ? amountFromModel
            : (fallbackAmount > 1000 ? fallbackAmount / 100 : fallbackAmount)
        ).toFixed(2)
      );

      if (amountRupees > 0) {
        const existingExpenseTx = await Transaction.findOne({
          userId: userObjectId,
          type: 'expense',
          source: 'payment',
          sourceRef,
        }).lean();

        let syncedTx: any = null;
        if (!existingExpenseTx) {
          syncedTx = await Transaction.create({
            userId: userObjectId,
            type: 'expense',
            category: 'Tax Filing',
            amount: amountRupees,
            description: `Tax filing payment for ITR ${String(itr._id).slice(-8)}`,
            date: new Date(),
            source: 'payment',
            sourceRef,
          });
        }

        if (syncedTx) {
          io.emit('transactionAdded', {
            _id: syncedTx._id,
            userId: String(userObjectId),
            type: syncedTx.type,
            amount: Number(syncedTx.amount || 0),
            category: syncedTx.category,
            description: syncedTx.description,
            date: syncedTx.date,
            createdAt: syncedTx.createdAt,
          });
        }
      }
    } catch (syncErr: any) {
      // Non-blocking: payment success should not fail due to transaction sync issues.
      console.error('[payment.verify] transaction sync failed:', syncErr?.message || syncErr);
    }

    await AuditLog.create({
      adminId: req.user!.userId,
      action: 'PAYMENT_VERIFIED',
      targetType: 'Itr',
      targetId: String(itr._id),
      details: `Razorpay payment verified (${razorpay_payment_id})`,
      severity: 'medium',
    });

    const adminUsers = await User.find({ role: 'ADMIN' }).select('_id').lean();
    const notifications: any[] = [
      {
        userId: itr.userId,
        title: 'Payment completed',
        message: 'Your ITR payment has been verified.',
        type: 'SUCCESS',
      },
    ];
    if ((itr as any).assignedCaId) {
      notifications.push({
        userId: (itr as any).assignedCaId,
        title: 'ITR payment completed',
        message: 'Taxpayer payment completed. You can proceed with final filing.',
        type: 'INFO',
      });
    }
    adminUsers.forEach((a: any) =>
      notifications.push({
        userId: a._id,
        title: 'Payment received',
        message: `Payment received for ITR ${String(itr._id).slice(-6)}`,
        type: 'INFO',
      })
    );
    await Notification.insertMany(notifications);

    io.emit('paymentUpdated', {
      itrId: String(itr._id),
      userId: String(itr.userId),
      amount: Number(payment.amountRupees || payment.amount || 0),
      status: 'payment_completed',
      payment: {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amount: Number(payment.amountRupees || payment.amount || 0),
        currency: payment.currency,
        paymentStatus: 'paid',
        paidAt: payment.paidAt,
      },
    });
    io.emit('transaction_update', { userId: String(itr.userId), reason: 'paymentVerified' });
    io.emit('budgetRefresh', { userId: String(itr.userId), reason: 'paymentVerified' });
    io.emit('analyticsRefresh', { userId: String(itr.userId), reason: 'paymentVerified' });

    return res.json({ success: true, message: 'Payment verified successfully' });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message || 'Payment verification failed' });
  }
}

export async function getItrPaymentStatus(req: AuthedRequest, res: Response) {
  try {
    const userId = String(req.user!.userId);
    const itrId = String(req.params.itrId || '');
    const itr = await Itr.findOne({ _id: itrId, userId }).lean();
    if (!itr) return res.status(404).json({ success: false, message: 'ITR not found' });
    const payment = await Payment.findOne({ itrId }).sort({ createdAt: -1 }).lean();
    return res.json({
      success: true,
      paymentStatus: String((itr as any).paymentStatus || itr.payment?.paymentStatus || 'not_required'),
      filingStatus: String((itr as any).filingStatus || itr.status || 'draft'),
      amount: Number((itr as any).paymentAmount || itr.payment?.amount || 0),
      paidAt: (itr as any).paidAt || itr.payment?.paidAt || null,
      razorpayPaymentId: String((itr as any).paymentId || itr.payment?.paymentId || ''),
      failureReason: payment?.failureReason || '',
      breakdown: payment
        ? {
            filingFee: payment.filingFee,
            caServiceFee: payment.caServiceFee,
            platformFee: payment.platformFee,
            subtotal: payment.subtotal,
            cgst: payment.cgst,
            sgst: payment.sgst,
            igst: payment.igst,
            totalGst: payment.totalGst,
          }
        : null,
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message || 'Failed to get payment status' });
  }
}

async function canViewItr(req: AuthedRequest, itr: any): Promise<boolean> {
  const role = String(req.user?.role || 'USER');
  const uid = String(req.user?.userId || '');
  if (role === 'ADMIN') return true;
  if (String(itr.userId) === uid) return true;
  if (String(itr.assignedCaId || '') === uid) return true;
  return false;
}

export async function downloadReceipt(req: AuthedRequest, res: Response) {
  try {
    const itr = await Itr.findById(req.params.itrId).lean();
    if (!itr) return res.status(404).json({ success: false, message: 'ITR not found' });
    if (!(await canViewItr(req, itr))) return res.status(403).json({ success: false, message: 'Access denied' });
    const payment = await Payment.findOne({ itrId: itr._id }).sort({ createdAt: -1 }).lean();
    if (!payment) return res.status(404).json({ success: false, message: 'Payment record not found' });
    if (payment.status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Receipt is available only for paid transactions' });
    }
    const user = await User.findById(itr.userId).select('name email').lean();

    sendPaymentPdf({
      res,
      title: 'Payment Receipt',
      fileName: `TaxSphere_Receipt_${String(itr._id)}.pdf`,
      lines: [
        { label: 'Receipt Number', value: `RCPT-${String(payment._id).slice(-8).toUpperCase()}` },
        { label: 'User', value: `${(user as any)?.name || 'User'} (${(user as any)?.email || ''})` },
        { label: 'ITR ID', value: String(itr._id) },
        { label: 'Assessment Year', value: String((itr as any).assessmentYear || '-') },
        { label: 'Razorpay Order ID', value: String(payment.razorpayOrderId || '-') },
        { label: 'Razorpay Payment ID', value: String(payment.razorpayPaymentId || '-') },
        { label: 'Payment Date', value: payment.paidAt ? new Date(payment.paidAt).toISOString() : '-' },
        ...paymentBreakdownLines(payment),
        { label: 'Payment Status', value: String(payment.status || '-') },
      ],
      footer: 'This is a system-generated receipt.',
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to generate receipt' });
  }
}

export async function downloadInvoice(req: AuthedRequest, res: Response) {
  try {
    const itr = await Itr.findById(req.params.itrId).lean();
    if (!itr) return res.status(404).json({ success: false, message: 'ITR not found' });
    if (!(await canViewItr(req, itr))) return res.status(403).json({ success: false, message: 'Access denied' });
    const payment = await Payment.findOne({ itrId: itr._id }).sort({ createdAt: -1 }).lean();
    if (!payment) return res.status(404).json({ success: false, message: 'Payment record not found' });
    if (payment.status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Invoice is available only for paid transactions' });
    }
    const user = await User.findById(itr.userId).select('name email').lean();

    sendPaymentPdf({
      res,
      title: 'Tax Invoice',
      fileName: `TaxSphere_Invoice_${String(itr._id)}.pdf`,
      lines: [
        { label: 'Invoice Number', value: `INV-${String(payment._id).slice(-8).toUpperCase()}` },
        { label: 'Invoice Date', value: new Date((payment as any).createdAt || Date.now()).toISOString() },
        { label: 'Billed To', value: `${(user as any)?.name || 'User'} (${(user as any)?.email || ''})` },
        { label: 'Service Provider', value: 'TaxSphere' },
        { label: 'Service Description', value: 'ITR Filing Fee + CA Review + Platform Convenience Fee' },
        ...paymentBreakdownLines(payment),
        { label: 'Payment Method', value: 'Razorpay' },
        { label: 'Payment Status', value: String(payment.status || '-') },
        { label: 'Terms', value: 'This invoice is generated electronically and valid without signature.' },
      ],
      footer: 'This is a system-generated invoice.',
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to generate invoice' });
  }
}

export async function getCaCommissionSummary(req: AuthedRequest, res: Response) {
  try {
    const caId = String(req.user!.userId);
    const itemsRaw = await CaCommission.find({ caId })
      .populate('paymentId', 'caServiceFee')
      .sort({ createdAt: -1 })
      .lean();
    const items = itemsRaw.map((x: any) => {
      const normalized = normalizeCommissionAmountRupees({
        commissionAmount: x.commissionAmount,
        caServiceFee: x.caServiceFee,
        paymentCaServiceFee: x.paymentId?.caServiceFee,
      });
      return {
        _id: x._id,
        itrId: x.itrId,
        status: x.status,
        creditedAt: x.creditedAt,
        createdAt: x.createdAt,
        caServiceFee: normalized.caServiceFee,
        commissionAmount: normalized.commissionAmount,
      };
    });
    const total = Number(items.reduce((acc, x: any) => acc + Number(x.commissionAmount || 0), 0).toFixed(2));
    const pendingPayout = Number(items.filter((x: any) => x.status === 'pending_payout').reduce((acc, x: any) => acc + Number(x.commissionAmount || 0), 0).toFixed(2));
    const paidOut = Number(items.filter((x: any) => x.status === 'paid_out').reduce((acc, x: any) => acc + Number(x.commissionAmount || 0), 0).toFixed(2));
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthlyCommission = Number(
      items
      .filter((x: any) => new Date(x.createdAt || x.creditedAt || 0) >= monthStart)
      .reduce((acc, x: any) => acc + Number(x.commissionAmount || 0), 0)
      .toFixed(2)
    );
    const casesPaid = items.length;

    res.json({
      success: true,
      totalCommission: total,
      monthlyCommission,
      casesPaid,
      totals: { total, pendingPayout, paidOut },
      items,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to load commission summary' });
  }
}
