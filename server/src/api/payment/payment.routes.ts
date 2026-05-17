import express from 'express';
import { authenticateToken } from '../auth/auth';
import * as paymentController from './payment.controller';

const router = express.Router();

router.get('/config', paymentController.getPaymentConfig);
router.use(authenticateToken);
router.post('/itr/:itrId/create-order', paymentController.createItrOrder);
router.post('/itr/:itrId/verify', paymentController.verifyItrPayment);
router.get('/itr/:itrId/status', paymentController.getItrPaymentStatus);
router.get('/itr/:itrId/receipt', paymentController.downloadReceipt);
router.get('/itr/:itrId/invoice', paymentController.downloadInvoice);
router.get('/ca/commission-summary', paymentController.getCaCommissionSummary);

export default router;
