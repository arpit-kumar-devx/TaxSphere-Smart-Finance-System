import express, { Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import User from '../auth/user.model';
import { AuthedRequest, authenticateToken } from '../auth/auth';

const router = express.Router();

const profileUploadDir = path.join(process.cwd(), 'uploads', 'profiles');
if (!fs.existsSync(profileUploadDir)) {
  fs.mkdirSync(profileUploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, profileUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `profile-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/jpg', 'image/png'].includes(file.mimetype);
    if (ok) {
      cb(null, true);
      return;
    }
    cb(new Error('Only JPG, JPEG, and PNG images are allowed'));
  },
  limits: { fileSize: 2 * 1024 * 1024 },
});

type UserDoc = {
  _id: string;
  name?: string;
  email?: string;
  role?: 'USER' | 'CA' | 'ADMIN';
  status?: 'active' | 'suspended';
  createdAt?: string;
  profilePhoto?: string;
  phone?: string;
  dob?: Date | string | null;
  gender?: string;
  country?: string;
  city?: string;
  address?: string;
  occupation?: string;
  workType?: string;
  panNumber?: string;
  aadhaarNumber?: string;
  taxRegime?: string;
  incomeBracket?: string;
  notificationPreferences?: Record<string, boolean>;
  emailPreferences?: Record<string, boolean>;
  privacyPreferences?: { profileVisibility?: string; analyticsConsent?: boolean };
};

function toProfile(u: UserDoc) {
  return {
    id: String(u._id),
    fullName: u.name || '',
    email: u.email || '',
    role: u.role || 'USER',
    status: u.status || 'active',
    memberSince: u.createdAt || null,
    profilePhoto: u.profilePhoto || '',
    phone: u.phone || '',
    dob: u.dob || null,
    gender: u.gender || 'prefer_not_to_say',
    country: u.country || '',
    city: u.city || '',
    address: u.address || '',
    occupation: u.occupation || '',
    workType: u.workType || 'other',
    panNumber: u.panNumber || '',
    aadhaarNumber: u.aadhaarNumber || '',
    taxRegime: u.taxRegime || 'new',
    incomeBracket: u.incomeBracket || 'under_5l',
    notificationPreferences: {
      productUpdates: Boolean(u.notificationPreferences?.productUpdates ?? true),
      taxAlerts: Boolean(u.notificationPreferences?.taxAlerts ?? true),
      reminders: Boolean(u.notificationPreferences?.reminders ?? true),
    },
    emailPreferences: {
      statements: Boolean(u.emailPreferences?.statements ?? true),
      newsletters: Boolean(u.emailPreferences?.newsletters ?? false),
    },
    privacyPreferences: {
      profileVisibility: u.privacyPreferences?.profileVisibility || 'private',
      analyticsConsent: Boolean(u.privacyPreferences?.analyticsConsent ?? true),
    },
  };
}

function getUserId(req: AuthedRequest): string | null {
  if (!req.user) return null;
  return String(req.user._id ?? req.user.id ?? req.user.userId ?? '');
}

router.get('/me', authenticateToken, async (req: AuthedRequest, res: Response) => {
  const id = getUserId(req);
  if (!id) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const me = await User.findById(id).select('-password').lean<UserDoc>();
  if (!me) return res.status(404).json({ success: false, message: 'User not found' });
  return res.json({ success: true, data: toProfile(me) });
});

router.get('/profile', authenticateToken, async (req: AuthedRequest, res: Response) => {
  const id = getUserId(req);
  if (!id) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const me = await User.findById(id).select('-password').lean<UserDoc>();
  if (!me) return res.status(404).json({ success: false, message: 'User not found' });
  return res.json({ success: true, data: toProfile(me) });
});

router.put('/me', authenticateToken, async (req: AuthedRequest, res: Response) => {
  const id = getUserId(req);
  if (!id) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const body = req.body || {};
  const update: Record<string, unknown> = {};
  const textFields = ['fullName', 'phone', 'gender', 'country', 'city', 'address', 'occupation', 'workType', 'panNumber', 'aadhaarNumber', 'taxRegime', 'incomeBracket'];
  for (const key of textFields) {
    if (body[key] !== undefined) {
      update[key === 'fullName' ? 'name' : key] = String(body[key] ?? '').trim();
    }
  }
  if (body.email !== undefined) update.email = String(body.email).trim().toLowerCase();
  if (body.dob !== undefined) update.dob = body.dob ? new Date(body.dob) : null;
  if (body.notificationPreferences) update.notificationPreferences = body.notificationPreferences;
  if (body.emailPreferences) update.emailPreferences = body.emailPreferences;
  if (body.privacyPreferences) update.privacyPreferences = body.privacyPreferences;

  if (typeof update.email === 'string' && update.email) {
    const exists = await User.findOne({ email: update.email, _id: { $ne: id } }).lean();
    if (exists) return res.status(400).json({ success: false, message: 'Email already in use' });
  }

  const updated = await User.findByIdAndUpdate(id, update, { new: true, runValidators: true }).select('-password').lean<UserDoc>();
  if (!updated) return res.status(404).json({ success: false, message: 'User not found' });
  return res.json({ success: true, data: toProfile(updated) });
});

router.put('/profile', authenticateToken, async (req: AuthedRequest, res: Response) => {
  const id = getUserId(req);
  if (!id) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const body = req.body || {};
  const update: Record<string, unknown> = {};
  const textFields = ['fullName', 'phone', 'gender', 'country', 'city', 'address', 'occupation', 'workType', 'panNumber', 'aadhaarNumber', 'taxRegime', 'incomeBracket'];
  for (const key of textFields) {
    if (body[key] !== undefined) {
      update[key === 'fullName' ? 'name' : key] = String(body[key] ?? '').trim();
    }
  }
  if (body.email !== undefined) update.email = String(body.email).trim().toLowerCase();
  if (body.dob !== undefined) update.dob = body.dob ? new Date(body.dob) : null;
  if (body.notificationPreferences) update.notificationPreferences = body.notificationPreferences;
  if (body.emailPreferences) update.emailPreferences = body.emailPreferences;
  if (body.privacyPreferences) update.privacyPreferences = body.privacyPreferences;

  if (typeof update.email === 'string' && update.email) {
    const exists = await User.findOne({ email: update.email, _id: { $ne: id } }).lean();
    if (exists) return res.status(400).json({ success: false, message: 'Email already in use' });
  }

  const updated = await User.findByIdAndUpdate(id, update, { new: true, runValidators: true }).select('-password').lean<UserDoc>();
  if (!updated) return res.status(404).json({ success: false, message: 'User not found' });
  return res.json({ success: true, data: toProfile(updated) });
});

router.patch('/profile-photo', authenticateToken, upload.single('photo'), async (req: AuthedRequest, res: Response) => {
  const id = getUserId(req);
  if (!id) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ success: false, message: 'Photo file is required' });

  const relativePath = path.join('uploads', 'profiles', req.file.filename).replace(/\\/g, '/');
  const updated = await User.findByIdAndUpdate(id, { profilePhoto: `/${relativePath}` }, { new: true }).select('-password').lean<UserDoc>();
  if (!updated) return res.status(404).json({ success: false, message: 'User not found' });
  return res.json({ success: true, message: 'Profile photo updated', data: toProfile(updated) });
});

router.patch('/password', authenticateToken, async (req: AuthedRequest, res: Response) => {
  const id = getUserId(req);
  if (!id) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Current and new password are required' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }
  const user = await User.findById(id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const ok = await bcrypt.compare(String(currentPassword), String((user as any).password || ''));
  if (!ok) return res.status(400).json({ success: false, message: 'Current password is incorrect' });

  (user as any).password = await bcrypt.hash(String(newPassword), 12);
  await user.save();
  return res.json({ success: true, message: 'Password updated successfully' });
});

export default router;
