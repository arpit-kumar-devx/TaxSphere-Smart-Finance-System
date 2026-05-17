import { validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export function handleValidation(req: Request, res: Response, next: NextFunction) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const list = errors.array();
    const firstMessage = list[0]?.msg || 'Validation failed';
    return res.status(422).json({ message: firstMessage, errors: list });
  }
  next();
}
