import express from 'express';
import { authenticateToken } from '../auth/auth';
import { requireRoles } from '../../middleware/role';
import { uploadItrDocument } from './multer.config';
import * as documentController from './document.controller';

const router = express.Router();

router.use(authenticateToken);
router.use(requireRoles('USER'));

router.post(
  '/itr/:itrId',
  (req, res, next) => {
    uploadItrDocument.single('file')(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Upload error';
        res.status(400).json({ message: msg });
        return;
      }
      next();
    });
  },
  documentController.uploadForItr
);

export default router;
