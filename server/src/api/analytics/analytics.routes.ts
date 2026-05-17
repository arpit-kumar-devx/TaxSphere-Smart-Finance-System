import express from 'express';
import { authenticateToken } from '../auth/auth';
import { handleValidationErrors } from '../../utils/validators/dashboardValidation';
import { query } from 'express-validator';
import { getCategory, getMonthly, getOverview, getSummary, getUserOverview } from './analytics.controller';

const router = express.Router();
router.use(authenticateToken);

router.get(
  '/summary',
  [
    query('month').isInt({ min: 1, max: 12 }).toInt(),
    query('year').isInt({ min: 2000, max: 2100 }).toInt(),
    query('regime').optional().isIn(['OLD', 'NEW']),
  ],
  handleValidationErrors,
  getSummary
);

router.get(
  '/monthly',
  [query('regime').optional().isIn(['OLD', 'NEW'])],
  handleValidationErrors,
  getMonthly
);

router.get(
  '/category',
  [
    query('month').isInt({ min: 1, max: 12 }).toInt(),
    query('year').isInt({ min: 2000, max: 2100 }).toInt(),
    query('top').optional().isInt({ min: 1, max: 20 }).toInt(),
  ],
  handleValidationErrors,
  getCategory
);

router.get(
  '/overview',
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ],
  handleValidationErrors,
  getOverview
);

router.get('/user', getUserOverview);

export default router;
