import express from 'express';
import { authenticateToken } from '../auth/auth';
import { requireRoles } from '../../middleware/role';
import { 
  stats, listUsers, setUserRole, setUserStatus, 
  listItrs, getItr, setItrStatus, assignCa, 
  getAuditLogs, getSettings, updateSettings, 
  getNotifications, markNotificationRead, markAllNotificationsRead,
  listCas,
  analyticsOverview,
} from './admin.controller';

const router = express.Router();

router.use(authenticateToken);
router.use(requireRoles('ADMIN'));

router.get('/stats', stats);
router.get('/dashboard', stats);
router.get('/analytics/overview', analyticsOverview);

// Users
router.get('/users', listUsers);
router.patch('/users/:userId/role', setUserRole);
router.patch('/users/:userId/status', setUserStatus);
router.patch('/users/:id/role', setUserRole);
router.patch('/users/:id/status', setUserStatus);

// ITR Registry
router.get('/itr', listItrs);
router.get('/itrs', listItrs);
router.get('/itr/:id', getItr);
router.patch('/itr/:id/status', setItrStatus);
router.patch('/itr/:id/assign-ca', assignCa);
router.patch('/itrs/:id/status', setItrStatus);
router.patch('/itrs/:id/assign-ca', assignCa);

// Audit Logs
router.get('/audit-logs', getAuditLogs);

// Settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// Notifications (Admin specific, though can be general)
router.get('/notifications', getNotifications);
router.patch('/notifications/:id/read', markNotificationRead);
router.patch('/notifications/read-all', markAllNotificationsRead);

// Helpers
router.get('/cas', listCas);

export default router;
