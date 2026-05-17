import { Response } from 'express';
import { AuthedRequest } from '../auth/auth';
import { itrService } from './itr.service';
import { itrPdfService } from './itr-pdf.service';
import Payment from '../payment/payment.model';
import { io } from '../../server';

export async function listMine(req: AuthedRequest, res: Response) {
  const userId = String(req.user!.userId);
  const list = await itrService.listForUser(userId);
  res.json({ items: list });
}

export async function create(req: AuthedRequest, res: Response) {
  try {
    const userId = String(req.user!.userId);
    const itr = await itrService.create(userId, req.body || {});
    io.emit('itrUpdated', { id: itr._id, userId, status: itr.status });
    res.status(201).json(itr);
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Create failed' });
  }
}

export async function getOne(req: AuthedRequest, res: Response) {
  const userId = String(req.user!.userId);
  const doc = await itrService.getById(req.params.id, userId, 'USER');
  if (!doc) return res.status(404).json({ message: 'Not found' });
  res.json(doc);
}

export async function update(req: AuthedRequest, res: Response) {
  try {
    const userId = String(req.user!.userId);
    const updated = await itrService.updateDraft(req.params.id, userId, req.body || {});
    if (!updated) return res.status(404).json({ message: 'Not found' });
    io.emit('itrUpdated', { id: updated._id, userId, status: updated.status });
    res.json(updated);
  } catch (e: any) {
    if (e?.message === 'NOT_EDITABLE') {
      return res.status(400).json({ message: 'ITR cannot be edited in current status' });
    }
    res.status(500).json({ message: e?.message || 'Update failed' });
  }
}

export async function calculate(req: AuthedRequest, res: Response) {
  try {
    const userId = String(req.user!.userId);
    const doc = await itrService.applyTaxEngine(req.params.id, userId);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    io.emit('itrUpdated', { id: doc._id, userId, status: doc.status, taxSummary: doc.taxSummary });
    res.json(doc);
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Calculate failed' });
  }
}

export async function submitForPayment(req: AuthedRequest, res: Response) {
  const userId = String(req.user!.userId);
  const itrId = req.params.id;

  console.log(`[ITR Submit] Processing ID: ${itrId} for User: ${userId}`);
  console.log(`[ITR Submit] Request Body:`, JSON.stringify(req.body));

  try {
    const doc = await itrService.submitForPayment(itrId, userId);
    if (!doc) {
      console.warn(`[ITR Submit] ITR not found: ${itrId}`);
      return res.status(404).json({ message: 'ITR not found' });
    }
    
    console.log(`[ITR Submit] Success for ID: ${itrId}. Status: ${doc.status}`);
    io.emit('itrUpdated', { id: doc._id, userId, status: doc.status });
    res.json(doc);
  } catch (e: any) {
    console.error(`[ITR Submit] Error for ID: ${itrId}:`, e.message);

    const map: Record<string, string> = {
      PAN_REQUIRED: 'Valid PAN is required in Personal Info',
      NAME_REQUIRED: 'First name is required in Personal Info',
      INVALID_STATUS: 'This ITR is already submitted or filed',
      NO_TAX_DUE: 'No payment required because final tax is zero',
      DOCS_REQUIRED: 'Please upload required documents (PAN, Aadhaar, and Form 16) before proceeding',
    };
    const msg = map[e?.message] || e?.message || 'Submit for payment failed';
    res.status(400).json({ message: msg });
  }
}

export async function submitFree(req: AuthedRequest, res: Response) {
  const userId = String(req.user!.userId);
  const itrId = req.params.id;
  try {
    const doc = await itrService.submitFree(itrId, userId);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    io.emit('itrUpdated', { id: doc._id, userId, status: doc.status });
    res.json(doc);
  } catch (e: any) {
    res.status(400).json({ message: e?.message || 'Submit free failed' });
  }
}

export async function downloadPdf(req: AuthedRequest, res: Response) {
  try {
    const userId = String(req.user!.userId);
    const role = req.user!.role;
    const doc = await itrService.getById(req.params.id, userId, role);
    if (!doc) return res.status(404).json({ message: 'Not found' });

    itrPdfService.generateSummary(doc as any, res);
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Download failed' });
  }
}

export async function downloadItrPdf(req: AuthedRequest, res: Response) {
  try {
    const userId = String(req.user?.userId || req.user?.id || req.user?._id || '');
    const role = String(req.user?.role || 'USER').toUpperCase();
    const itrId = String(req.params.itrId || '');

    console.log('ITR PDF download request:', {
      itrId,
      userId,
      role,
    });

    const doc = await itrService.getByIdAny(itrId);
    if (!doc) return res.status(404).json({ message: 'ITR not found' });

    const isOwner = String((doc as any).userId || '') === userId;
    const isAssignedCa = !!(doc as any).assignedCaId && String((doc as any).assignedCaId) === userId;
    const isAdmin = role === 'ADMIN';
    if (!isOwner && !isAssignedCa && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to download this ITR' });
    }

    const filingStatus = String((doc as any).filingStatus || (doc as any).status || '').toLowerCase();
    const itrPaymentStatus = String((doc as any).paymentStatus || (doc as any).payment?.paymentStatus || '').toLowerCase();
    let resolvedPaymentStatus = itrPaymentStatus;
    if (!resolvedPaymentStatus || resolvedPaymentStatus === 'not_required') {
      const paidPayment = await Payment.findOne({ itrId: (doc as any)._id, status: 'paid' })
        .sort({ paidAt: -1, createdAt: -1 })
        .lean();
      if (paidPayment) resolvedPaymentStatus = 'paid';
    }

    const canDownload = resolvedPaymentStatus === 'paid' || ['payment_completed', 'filed'].includes(filingStatus);
    if (!canDownload) {
      return res.status(400).json({ message: 'ITR PDF is available only after payment completion' });
    }

    itrPdfService.generateFiledReturn(doc as any, res);
  } catch (e: any) {
    console.error('Download ITR PDF error:', e);
    res.status(500).json({ message: e?.message || 'Unable to generate ITR PDF' });
  }
}
