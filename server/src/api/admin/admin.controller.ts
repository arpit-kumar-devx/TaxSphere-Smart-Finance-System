import { Response } from 'express';
import { AuthedRequest } from '../auth/auth';
import User from '../auth/user.model';
import Itr from '../itr/itr.model';
import Transaction from '../transaction/Transaction.model';
import { itrService } from '../itr/itr.service';
import AuditLog from '../audit/audit.model';
import Notification from '../notification/notification.model';
import SystemSettings from '../settings/settings.model';
import Payment from '../payment/payment.model';
import CaCommission from '../payment/ca-commission.model';
import { normalizeCommissionAmountRupees } from '../payment/payment.helpers';

// --- UTILS ---
async function logAction(adminId: string, action: string, targetType: string, targetId: string, details: string, severity: 'low' | 'medium' | 'high' | 'critical' = 'low') {
  try {
    await AuditLog.create({ adminId, action, targetType, targetId, details, severity });
  } catch (e) {
    console.error('[AuditLog] Error logging action:', e);
  }
}

async function notifyUser(userId: string, title: string, message: string, type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' = 'INFO') {
  try {
    await Notification.create({ userId, title, message, type });
  } catch (e) {
    console.error('[Notification] Error creating notification:', e);
  }
}

// --- STATS ---
export async function stats(req: AuthedRequest, res: Response) {
  const [totalUsers, activeUsers, totalItr, pendingReview, approvedFilings, revenueAgg, activeCAs, failedPayments, pendingPayments, completedPayments, gstAgg, commissionRowsRaw] = await Promise.all([
    User.countDocuments({ role: 'USER' }),
    User.countDocuments({ role: 'USER', status: 'active' }),
    Itr.countDocuments({}),
    Itr.countDocuments({ status: { $in: ['payment_pending', 'under_review', 'assigned'] } }),
    Itr.countDocuments({ status: 'approved' }),
    Itr.aggregate([
      { $match: { 'payment.paymentStatus': 'paid' } },
      { $group: { _id: null, total: { $sum: '$payment.amount' } } },
    ]),
    User.countDocuments({ role: 'CA', status: 'active' }),
    Itr.countDocuments({ 'payment.paymentStatus': { $in: ['failed', 'failure'] } }),
    Itr.countDocuments({ 'payment.paymentStatus': { $in: ['pending', 'created'] } }),
    Itr.countDocuments({ 'payment.paymentStatus': 'paid' }),
    Payment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalGst' } } }]),
    CaCommission.find({}).populate('paymentId', 'caServiceFee').select('commissionAmount caServiceFee paymentId').lean(),
  ]);

  const totalRevenuePaise = revenueAgg[0]?.total || 0;
  const gstCollectedPaise = gstAgg[0]?.total || 0;
  const caCommissionInr = Number(
    commissionRowsRaw
      .map((row: any) =>
        normalizeCommissionAmountRupees({
          commissionAmount: row.commissionAmount,
          caServiceFee: row.caServiceFee,
          paymentCaServiceFee: row.paymentId?.caServiceFee,
        }).commissionAmount
      )
      .reduce((acc: number, x: number) => acc + Number(x || 0), 0)
      .toFixed(2)
  );
  const caCommissionPaise = Math.round(caCommissionInr * 100);
  const systemHealth = failedPayments > 10 ? 'warning' : 'healthy';
  res.json({
    totalUsers,
    activeUsers,
    totalCAs: activeCAs,
    totalItrFilings: totalItr,
    pendingReviews: pendingReview,
    approvedFilings,
    totalRevenuePaise,
    totalRevenueInr: totalRevenuePaise / 100,
    activeCAs,
    failedPayments,
    pendingPayments,
    completedPayments,
    gstCollectedPaise,
    gstCollectedInr: gstCollectedPaise / 100,
    caCommissionCreditedPaise: caCommissionPaise,
    caCommissionCreditedInr: caCommissionInr,
    systemHealth,
  });
}

// --- USERS ---
export async function listUsers(_req: AuthedRequest, res: Response) {
  const users = await User.find({})
    .select('-password')
    .sort({ createdAt: -1 })
    .lean();
  res.json({
    items: users.map((u: any) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status || 'active',
      createdAt: u.createdAt,
    })),
  });
}

export async function setUserRole(req: AuthedRequest, res: Response) {
  const adminId = req.user!.userId;
  const { role } = req.body as { role?: string };
  if (!['USER', 'CA', 'ADMIN'].includes(role || '')) {
    return res.status(400).json({ message: 'Invalid role' });
  }
  const u = await User.findByIdAndUpdate(
    req.params.userId || req.params.id,
    { role },
    { new: true, runValidators: true }
  ).select('-password');
  if (!u) return res.status(404).json({ message: 'User not found' });
  
  await logAction(adminId, 'ROLE_CHANGE', 'User', String(u._id), `Role changed to ${role}`, 'medium');
  
  res.json({
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
  });
}

export async function setUserStatus(req: AuthedRequest, res: Response) {
  const adminId = req.user!.userId;
  const { status } = req.body as { status?: string };
  if (!['active', 'suspended'].includes(status || '')) {
    return res.status(400).json({ message: 'Invalid status' });
  }
  const u = await User.findByIdAndUpdate(
    req.params.userId || req.params.id,
    { status },
    { new: true }
  ).select('-password');
  if (!u) return res.status(404).json({ message: 'User not found' });

  await logAction(adminId, 'STATUS_CHANGE', 'User', String(u._id), `Status changed to ${status}`, status === 'suspended' ? 'high' : 'medium');

  res.json({
    id: String(u._id),
    name: u.name,
    status: u.status,
  });
}

// --- ITRs ---
export async function listItrs(_req: AuthedRequest, res: Response) {
  const items = await Itr.find({})
    .populate('userId', 'name email')
    .populate('assignedCaId', 'name email')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ items });
}

export async function setItrStatus(req: AuthedRequest, res: Response) {
  const adminId = req.user!.userId;
  let { status, remarks } = req.body as { status: string; remarks?: string };
  
  if (status) status = status.toLowerCase();

  const updated = await Itr.findByIdAndUpdate(
    req.params.id,
    { status, caRemarks: remarks },
    { new: true }
  ).populate('userId', 'name email');

  if (!updated) return res.status(404).json({ message: 'ITR not found' });

  await logAction(adminId, 'ITR_STATUS_UPDATE', 'Itr', String(updated._id), `Status updated to ${status}`, 'medium');
  await notifyUser(String(updated.userId._id), 'ITR Status Update', `Your ITR status has been updated to ${status}.`);

  res.json(updated);
}

// --- AUDIT LOGS ---
export async function getAuditLogs(_req: AuthedRequest, res: Response) {
  const logs = await AuditLog.find({})
    .populate('adminId', 'name email')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json({ items: logs });
}

// --- SETTINGS ---
export async function getSettings(_req: AuthedRequest, res: Response) {
  let settings = await SystemSettings.findOne();
  if (!settings) {
    settings = await SystemSettings.create({});
  }
  res.json(settings);
}

export async function updateSettings(req: AuthedRequest, res: Response) {
  const adminId = req.user!.userId;
  const settings = await SystemSettings.findOneAndUpdate(
    {},
    req.body,
    { new: true, upsert: true }
  );
  await logAction(adminId, 'SETTINGS_UPDATE', 'SystemSettings', String(settings._id), 'System settings updated', 'high');
  res.json(settings);
}

// --- NOTIFICATIONS (FOR BELL) ---
export async function getNotifications(req: AuthedRequest, res: Response) {
  const items = await Notification.find({ userId: req.user!.userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  res.json({ items });
}

export async function markNotificationRead(req: AuthedRequest, res: Response) {
  await Notification.findByIdAndUpdate(req.params.id, { read: true });
  res.json({ success: true });
}

export async function markAllNotificationsRead(req: AuthedRequest, res: Response) {
  await Notification.updateMany({ userId: req.user!.userId }, { read: true });
  res.json({ success: true });
}

// Reuse existing CA logic
export async function listCas(_req: AuthedRequest, res: Response) {
  const cas = await User.find({ role: 'CA' }).select('name email _id').lean();
  res.json({
    items: cas.map((c: any) => ({ id: String(c._id), name: c.name, email: c.email })),
  });
}

export async function getItr(req: AuthedRequest, res: Response) {
  const doc = await Itr.findById(req.params.id)
    .populate('userId', 'name email')
    .populate('assignedCaId', 'name email')
    .lean();
  if (!doc) return res.status(404).json({ message: 'Not found' });
  res.json(doc);
}

export async function assignCa(req: AuthedRequest, res: Response) {
  try {
    const adminId = req.user!.userId;
    const { id } = req.params;
    const { caUserId, caId } = req.body as { caUserId?: string, caId?: string };
    const targetCaId = caUserId || caId;

    console.log(`[Admin Assign CA] Start. ITR: ${id}, CA: ${targetCaId}, Admin: ${adminId}`);

    if (!targetCaId) {
      console.warn('[Admin Assign CA] Missing CA ID in request body');
      return res.status(400).json({ message: 'caUserId (or caId) required' });
    }

    const updated = await itrService.assignCa(id, targetCaId);
    if (!updated) {
      console.warn(`[Admin Assign CA] ITR not found: ${id}`);
      return res.status(404).json({ message: 'ITR not found' });
    }

    // Sync back to user's assignedCA field
    await User.findByIdAndUpdate(updated.userId, { assignedCA: targetCaId });
    
    await logAction(adminId, 'CA_ASSIGNMENT', 'Itr', String(updated._id), `CA assigned: ${targetCaId}`, 'medium');
    await notifyUser(String(updated.userId), 'CA Assigned', 'A professional CA has been assigned to your ITR filing.');

    console.log('[Admin Assign CA] Complete.');
    res.json({
      success: true,
      message: 'CA assigned successfully',
      itr: updated
    });
  } catch (e: any) {
    console.error('[Admin Assign CA] Error:', e);
    res.status(500).json({ message: e?.message || 'Assign failed' });
  }
}

export async function analyticsOverview(_req: AuthedRequest, res: Response) {
  try {
    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      totalUsers,
      totalAdmins,
      totalCAs,
      totalItrFilings,
      pendingVerifications,
      approvedFilings,
      rejectedFilings,
      paidRevenueAgg,
      paymentStatusAgg,
      txAgg,
      userGrowthAgg,
      filingTrendAgg,
      recentItrsRaw,
    ] = await Promise.all([
      User.countDocuments({ role: 'USER' }),
      User.countDocuments({ role: 'ADMIN' }),
      User.countDocuments({ role: 'CA' }),
      Itr.countDocuments({}),
      Itr.countDocuments({ status: { $in: ['submitted', 'assigned', 'under_review', 'payment_pending'] } }),
      Itr.countDocuments({ status: 'approved' }),
      Itr.countDocuments({ status: 'rejected' }),
      Itr.aggregate([
        { $match: { 'payment.paymentStatus': 'paid' } },
        { $group: { _id: null, total: { $sum: '$payment.amount' } } },
      ]),
      Itr.aggregate([
        { $group: { _id: '$payment.paymentStatus', count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ]),
      User.aggregate([
        { $match: { createdAt: { $gte: rangeStart } } },
        {
          $group: {
            _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
            total: { $sum: 1 },
          },
        },
      ]),
      Itr.aggregate([
        { $match: { createdAt: { $gte: rangeStart } } },
        {
          $group: {
            _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
            total: { $sum: 1 },
          },
        },
      ]),
      Itr.find({})
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const totalRevenue = Number(paidRevenueAgg[0]?.total || 0);
    const totalIncome = Number(txAgg.find((x: any) => x._id === 'income')?.total || 0);
    const totalExpense = Number(txAgg.find((x: any) => x._id === 'expense')?.total || 0);
    const net = totalIncome - totalExpense;

    const labels: string[] = [];
    const userGrowth: number[] = [];
    const filingTrend: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      labels.push(d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }));
      userGrowth.push(Number(userGrowthAgg.find((x: any) => x._id.y === y && x._id.m === m)?.total || 0));
      filingTrend.push(Number(filingTrendAgg.find((x: any) => x._id.y === y && x._id.m === m)?.total || 0));
    }

    const paymentStatusSummary = paymentStatusAgg.reduce((acc: Record<string, number>, row: any) => {
      acc[String(row._id || 'none')] = Number(row.count || 0);
      return acc;
    }, {});

    const recentCases = recentItrsRaw.map((it: any) => ({
      id: String(it._id),
      date: it.createdAt,
      type: 'ITR',
      source: String(it.status || 'draft').toUpperCase(),
      title: (it.userId as any)?.name || 'Taxpayer',
      amount: Number(it.payment?.amount || 0),
    }));

    res.json({
      success: true,
      data: {
        totalUsers,
        totalAdmins,
        totalCAs,
        totalItrFilings,
        pendingVerifications,
        approvedFilings,
        rejectedFilings,
        totalPaymentsCollected: totalRevenue,
        paymentStatusSummary,
        userGrowthTrend: { labels, data: userGrowth },
        filingTrend: { labels, data: filingTrend },
        totalIncome,
        totalExpense,
        netProfit: net,
        taxPaid: totalRevenue,
        transactions: recentCases,
        insights: [
          `Platform has ${totalUsers} active taxpayers and ${totalCAs} CAs.`,
          `Pending verification queue is ${pendingVerifications}.`,
          `Total collections: ₹${totalRevenue.toLocaleString('en-IN')}.`,
        ],
        monthlyBreakdown: {
          labels,
          datasets: [
            { label: 'User Growth', data: userGrowth, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.25)', fill: true },
            { label: 'ITR Filings', data: filingTrend, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.25)', fill: true },
          ],
        },
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to load admin analytics overview' });
  }
}
