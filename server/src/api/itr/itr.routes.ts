import express from 'express';
import { authenticateToken } from '../auth/auth';
import * as itrController from './itr.controller';

const router = express.Router();

router.use(authenticateToken);

router.get('/', itrController.listMine);
router.post('/', itrController.create);
// Keep explicit download route before generic :id routes.
router.get('/:itrId/download', itrController.downloadItrPdf);
router.get('/:id', itrController.getOne);
router.get('/:id/pdf', itrController.downloadPdf);
router.patch('/:id', itrController.update);
router.post('/:id/calculate', itrController.calculate);
router.post('/:id/submit-for-payment', itrController.submitForPayment);
router.post('/:id/submit-free', itrController.submitFree);

export default router;
