import { Response, NextFunction } from 'express';
import { AuthedRequest } from '../api/auth/auth';

export type AppRole = 'USER' | 'CA' | 'ADMIN';

export function requireRoles(...allowed: AppRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    /** Legacy accounts may have no role in DB; treat as USER. */
    const role = ((req.user?.role as AppRole | undefined) ?? 'USER') as AppRole;
    if (!allowed.includes(role)) {
      res.status(403).json({ message: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
