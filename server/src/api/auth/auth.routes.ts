import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticateToken, AuthedRequest } from './auth';
import { authService } from './auth.service';
import {
  registerValidator,
  loginValidator,
  forgotValidator,
  resetValidator,
} from '../../utils/validators/authValidators';
import { handleValidation } from '../../utils/validation';
import { sendResetEmail } from '../../utils/mailer';

const router = express.Router();
console.log('[auth routes] loaded');

// --- DEV DEBUG ---
router.get('/__health', (_req, res) => {
  res.json({ ok: true, router: 'auth', prefix: '/api/v1/auth' });
});
// --- /DEV DEBUG ---

router.use((req, res, next) => {
  if (req.path === '/__health') return next();
  if (mongoose.connection.readyState !== 1) {
    console.error('[auth.routes] blocked auth request: MongoDB is not connected');
    return res.status(503).json({ success: false, message: 'Database unavailable' });
  }
  return next();
});

// REGISTER
router.post(
  '/register',
  registerValidator,
  handleValidation,
  async (req: Request, res: Response) => {
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[auth.register] req.body:', req.body);
      }

      const {
        name,
        email,
        password,
        confirmPassword,
        country,
        incomeBracket,
        income_bracket,
      } = req.body || {};

      if (password !== confirmPassword) {
        return res.status(422).json({ message: 'Passwords do not match' });
      }

      const normalizedIncomeBracket = incomeBracket ?? income_bracket;
      const { user } = await authService.register({
        name,
        email,
        password,
        country,
        income_bracket: normalizedIncomeBracket,
      });

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: { user },
      });
    } catch (error: any) {
      if (error?.message === 'USER_EXISTS' || error?.code === 11000) {
        return res.status(409).json({ message: 'User already exists' });
      }
      if (error?.message && typeof error.message === 'string') {
        return res.status(422).json({ message: error.message });
      }
      res.status(500).json({ message: 'Error creating user' });
    }
  }
);

// LOGIN
router.post(
  '/login',
  loginValidator,
  handleValidation,
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      // Extra safety: validate after express-validator
      if (!email || !password) {
        console.warn('[Login] Missing email or password in body');
        return res.status(400).json({ success: false, message: 'Email and password are required', error: 'VALIDATION_ERROR' });
      }

      console.log('[Login] Attempting login for:', email);
      console.log('[Login] req.body keys:', Object.keys(req.body));
      const result = await authService.login(email, password);

      if (!result) {
        console.log('[Login] Invalid credentials for:', email);
        return res.status(400).json({ success: false, message: 'Invalid email or password', error: 'INVALID_CREDENTIALS' });
      }

      console.log('[Login] Success for:', email);
      res.json({ success: true, message: 'Login successful', ...result });
    } catch (error: any) {
      const errMsg = error?.message || 'Unknown error';
      console.error('[Login Error]', errMsg, error?.stack || '');

      // Map service-layer errors to user-friendly responses
      const errorMap: Record<string, { status: number; message: string }> = {
        EMAIL_REQUIRED:        { status: 400, message: 'Email is required' },
        PASSWORD_REQUIRED:     { status: 400, message: 'Password is required' },
        SERVER_CONFIG_ERROR:   { status: 500, message: 'Server configuration error. Please contact support.' },
        DATABASE_UNAVAILABLE:  { status: 503, message: 'Database unavailable' },
        DATABASE_ERROR:        { status: 503, message: 'Database unavailable' },
        PASSWORD_COMPARE_ERROR:{ status: 500, message: 'Authentication processing error. Please try again.' },
        TOKEN_SIGN_ERROR:      { status: 500, message: 'Session creation failed. Please try again.' },
      };

      const mapped = errorMap[errMsg];
      if (mapped) {
        return res.status(mapped.status).json({ success: false, message: mapped.message, error: errMsg });
      }

      res.status(500).json({ success: false, message: 'Login failed. Please try again later.', error: errMsg });
    }
  }
);

// ========= PROFILE: ME =========

// GET /api/v1/auth/me  -> current user's public profile
router.get('/me', authenticateToken, async (req: AuthedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    const id = String(req.user._id ?? req.user.id ?? req.user.userId);
    const me = await authService.getPublicById(id);
    if (!me) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: me, data: me });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || 'Failed to load profile' });
  }
});

// PUT /api/v1/auth/me  -> update name/email/country/income_bracket
router.put('/me', authenticateToken, async (req: AuthedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    const id = String(req.user._id ?? req.user.id ?? req.user.userId);
    const { name, email, country, income_bracket } = req.body || {};
    const updated = await authService.updateProfile(id, { name, email, country, income_bracket });
    res.json({ success: true, user: updated, data: updated });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e?.message || 'Update failed' });
  }
});

// ========= PASSWORD RESET FLOW =========

// FORGOT PASSWORD
router.post(
  '/forgot-password',
  forgotValidator,
  handleValidation,
  async (req: Request, res: Response) => {
    const { email } = req.body;
    const result = await authService.issueResetToken(email);

    // Always respond generically
    if (!result) return res.json({ message: 'If that email exists, we sent a reset link.' });

    const { resetToken } = result;
    const resetUrl = `${
      process.env.CLIENT_URL || 'http://localhost:4200'
    }/reset-password?token=${resetToken}`;
    console.log('[reset-url]', resetUrl);

    try {
      await sendResetEmail(email, resetUrl);
    } catch (e) {
      console.warn('[mailer] failed to send email in dev:', (e as any)?.message || e);
    }

    res.json({ message: 'If that email exists, we sent a reset link.' });
  }
);

// RESET PASSWORD
router.post(
  '/reset-password',
  resetValidator,
  handleValidation,
  async (req: Request, res: Response) => {
    const { token, password } = req.body;
    const result = await authService.resetPassword(token, password);
    if (!result) return res.status(400).json({ message: 'Invalid or expired reset token' });

    res.json({
      message: 'Password updated successfully',
      token: result.token,
      user: result.user,
    });
  }
);

export default router;
