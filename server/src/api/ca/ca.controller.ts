import { Response } from 'express';
import { AuthedRequest } from '../auth/auth';
import { itrService } from '../itr/itr.service';
import CAProfile from './ca-profile.model';
import Itr from '../itr/itr.model';
import CaCommission from '../payment/ca-commission.model';
import { normalizeCommissionAmountRupees } from '../payment/payment.helpers';

export async function listAssigned(req: AuthedRequest, res: Response) {
  try {
    const caId = String(req.user!.userId);
    const items = await itrService.listForCa(caId);
    const pendingReview = items.filter((x: any) => ['assigned', 'under_review'].includes(x.status)).length;
    const approved = items.filter((x: any) => x.status === 'approved').length;
    const rejected = items.filter((x: any) => x.status === 'rejected').length;
    const filed = items.filter((x: any) => x.status === 'filed').length;
    const docsPending = items.reduce((acc: number, it: any) => {
      const p = (it.documents || []).filter((d: any) => (d.status || 'pending') === 'pending').length;
      return acc + p;
    }, 0);
    const paymentsCompleted = items.filter((it: any) => {
      const p = String(it?.paymentStatus || it?.payment?.paymentStatus || '').toLowerCase();
      return p === 'paid';
    }).length;
    const commissionRowsRaw = await CaCommission.find({ caId })
      .populate('paymentId', 'caServiceFee')
      .select('commissionAmount caServiceFee paymentId')
      .lean();
    const commissionEarned = Number(
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
    res.json({
      data: items,
      items,
      commissionEarned,
      paymentsCompleted,
      summary: {
        assignedCases: items.length,
        pendingReview,
        docsPending,
        approved,
        rejected,
        filed,
        commissionEarned,
        paymentsCompleted,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

export async function getOne(req: AuthedRequest, res: Response) {
  try {
    const caId = String(req.user!.userId);
    const doc = await itrService.getByIdForCa(req.params.id, caId);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

export async function reviewDocument(req: AuthedRequest, res: Response) {
  try {
    const caId = String(req.user!.userId);
    const { status: rawStatus, remarks } = req.body as { status?: string; remarks?: string };
    const status = (rawStatus || '').toLowerCase();
    
    if (status !== 'verified' && status !== 'rejected') {
      return res.status(400).json({ message: 'status must be verified or rejected' });
    }
    
    const updated = await itrService.updateDocumentStatus(
      req.params.itrId || req.params.id,
      req.params.docId,
      caId,
      status as 'verified' | 'rejected',
      remarks
    );
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ message: e?.message || 'Failed to update document status' });
  }
}

export async function startReview(req: AuthedRequest, res: Response) {
  try {
    const caId = String(req.user!.userId);
    const updated = await itrService.setItrStatusByCa(req.params.id, caId, 'under_review');
    if (!updated) return res.status(404).json({ message: 'ITR not found' });
    res.json({ success: true, itr: updated });
  } catch (e: any) {
    res.status(400).json({ message: e?.message || 'Failed to start review' });
  }
}

export async function updateStatus(req: AuthedRequest, res: Response) {
  try {
    const caId = String(req.user!.userId);
    const { id } = req.params;
    let { status, caRemarks } = req.body as { status: string; caRemarks?: string };

    if (!status) return res.status(400).json({ message: 'status required' });
    status = status.toLowerCase();

    // Map user's UI actions to backend lifecycle
    const allowed = ['submitted', 'assigned', 'under_review', 'approved', 'rejected', 'payment_pending', 'payment_completed', 'filed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value for CA workflow' });
    }

    const itr = await itrService.setItrStatusByCa(id, caId, status as any, caRemarks);
    if (!itr) return res.status(404).json({ message: 'ITR not found' });

    const normalized = String((itr as any).filingStatus || itr.status || '').toLowerCase();
    const message =
      status === 'approved'
        ? 'ITR approved. Payment pending.'
        : status === 'rejected'
        ? 'ITR rejected.'
        : 'ITR status updated';

    res.json({
      success: true,
      data: itr,
      filingStatus: normalized,
      message,
    });
  } catch (e: any) {
    const map: Record<string, string> = {
      INVALID_TRANSITION: 'Invalid status transition',
      DOCUMENTS_PENDING: 'All documents must be reviewed first',
      HAS_REJECTED_DOCS: 'Rejected documents must be re-uploaded by taxpayer',
    };
    res.status(400).json({ message: map[e?.message] || e?.message || 'Failed' });
  }
}

export async function getProfile(req: AuthedRequest, res: Response) {
  try {
    const userId = String(req.user!.userId);
    let p = await CAProfile.findOne({ userId });
    if (!p) {
      p = await CAProfile.create({ userId });
    }
    res.json(p);
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

export async function updateProfile(req: AuthedRequest, res: Response) {
  try {
    const userId = String(req.user!.userId);
    const p = await CAProfile.findOneAndUpdate(
      { userId },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.json(p);
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

export async function analyticsOverview(req: AuthedRequest, res: Response) {
  try {
    const caId = String(req.user!.userId);
    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [counts, paidAgg, recentRaw, monthlyAgg, commissionRowsRaw] = await Promise.all([
      Itr.aggregate([
        { $match: { assignedCaId: req.user!._id || req.user!.userId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Itr.aggregate([
        { $match: { assignedCaId: req.user!._id || req.user!.userId, 'payment.paymentStatus': 'paid' } },
        { $group: { _id: null, total: { $sum: '$payment.amount' } } },
      ]),
      Itr.find({ assignedCaId: req.user!._id || req.user!.userId })
        .populate('userId', 'name email')
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),
      Itr.aggregate([
        { $match: { assignedCaId: req.user!._id || req.user!.userId, createdAt: { $gte: rangeStart } } },
        {
          $group: {
            _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
            total: { $sum: 1 },
          },
        },
      ]),
      CaCommission.find({ caId }).populate('paymentId', 'caServiceFee').select('commissionAmount caServiceFee paymentId createdAt').lean(),
    ]);

    const countMap = counts.reduce((acc: Record<string, number>, row: any) => {
      acc[String(row._id)] = Number(row.count || 0);
      return acc;
    }, {});

    const assignedItrs = Object.values(countMap).reduce((a: number, b: number) => a + b, 0);
    const pendingReviews = Number(countMap['assigned'] || 0) + Number(countMap['under_review'] || 0);
    const approved = Number(countMap['approved'] || 0);
    const rejected = Number(countMap['rejected'] || 0);
    const filed = Number(countMap['filed'] || 0);
    const grossPaidPaise = Number(paidAgg[0]?.total || 0);
    const commissionRows = commissionRowsRaw.map((row: any) =>
      normalizeCommissionAmountRupees({
        commissionAmount: row.commissionAmount,
        caServiceFee: row.caServiceFee,
        paymentCaServiceFee: row.paymentId?.caServiceFee,
      })
    );
    const commission = Number(
      commissionRows.reduce((acc: number, row: any) => acc + Number(row.commissionAmount || 0), 0).toFixed(2)
    );
    const monthlyCommission = Number(
      commissionRowsRaw
        .filter((row: any) => new Date(row.createdAt || 0) >= monthStart)
        .map((row: any) =>
          normalizeCommissionAmountRupees({
            commissionAmount: row.commissionAmount,
            caServiceFee: row.caServiceFee,
            paymentCaServiceFee: row.paymentId?.caServiceFee,
          }).commissionAmount
        )
        .reduce((acc: number, amount: number) => acc + Number(amount || 0), 0)
        .toFixed(2)
    );
    const grossPaid = Number((grossPaidPaise / 100).toFixed(2));

    const labels: string[] = [];
    const monthlyData: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      labels.push(d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }));
      monthlyData.push(Number(monthlyAgg.find((x: any) => x._id.y === y && x._id.m === m)?.total || 0));
    }

    const recentAssignedCases = recentRaw.map((it: any) => ({
      id: String(it._id),
      date: it.updatedAt || it.createdAt,
      type: 'ITR',
      source: String(it.status || 'assigned').toUpperCase(),
      title: (it.userId as any)?.name || 'Assigned Client',
      amount: Number(it.payment?.amount || 0),
    }));

    res.json({
      success: true,
      data: {
        assignedClients: new Set(recentRaw.map((x: any) => String(x.userId?._id || x.userId || ''))).size,
        assignedItrs,
        pendingReviews,
        approved,
        rejected,
        filed,
        commissionEarnings: commission,
        commissionEarningsPaise: Math.round(commission * 100),
        monthlyCommission,
        monthlyCommissionPaise: Math.round(monthlyCommission * 100),
        grossPaid,
        recentAssignedCases,
        totalIncome: commission,
        totalExpense: 0,
        netProfit: commission,
        taxPaid: 0,
        transactions: recentAssignedCases,
        insights: [
          `You have ${pendingReviews} cases in review pipeline.`,
          `Approved: ${approved}, Rejected: ${rejected}, Filed: ${filed}.`,
          `Commission credited: ₹${commission.toLocaleString('en-IN')}.`,
        ],
        monthlyBreakdown: {
          labels,
          datasets: [
            { label: 'Assigned Cases', data: monthlyData, borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.25)', fill: true },
          ],
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || 'Failed to load CA analytics overview' });
  }
}
