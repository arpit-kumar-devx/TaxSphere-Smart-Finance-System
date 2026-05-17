import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from './user.model';

export type UserRole = 'USER' | 'CA' | 'ADMIN';

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  profilePhoto?: string;
  phone?: string;
  country?: string;
  city?: string;
  status?: 'active' | 'suspended';
  createdAt?: string;
  income_bracket?: 'low' | 'middle' | 'high';
  role: UserRole;
};

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const RESET_WINDOW_MS = 30 * 60 * 1000;

// Startup diagnostic
console.log('[auth.service] JWT_SECRET source:', process.env.JWT_SECRET ? 'env' : 'fallback');

function toPublic(u: any): PublicUser {
  return {
    id: String(u._id ?? u.id),
    name: u.name,
    email: u.email,
    profilePhoto: u.profilePhoto,
    phone: u.phone,
    country: u.country,
    city: u.city,
    status: u.status,
    createdAt: u.createdAt,
    income_bracket: u.income_bracket,
    role: (u.role as UserRole) || 'USER',
  };
}

function sign(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '7d' });
}

function ensureDatabaseReady(scope: string): void {
  if (mongoose.connection.readyState !== 1) {
    console.error(`[auth.service] ${scope}: MongoDB is not connected`);
    throw new Error('DATABASE_UNAVAILABLE');
  }
}

async function hashPassword(pw: string) { return bcrypt.hash(pw, 12); }
async function comparePassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

export const authService = {
  async register(input: {
    name: string; email: string; password: string;
    country?: string; income_bracket?: 'low' | 'middle' | 'high';
  }): Promise<{ token: string; user: PublicUser }> {
    ensureDatabaseReady('register');
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');
    const country = String(input.country || '').trim() || 'US';
    const income_bracket = (input.income_bracket || 'middle') as 'low' | 'middle' | 'high';

    if (!name) throw new Error('Full Name is required');
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Please enter a valid email address');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');
    if (!['low', 'middle', 'high'].includes(income_bracket)) {
      throw new Error('Income Bracket must be low, middle, or high');
    }

    const existing = await User.findOne({ email });
    if (existing) throw new Error('USER_EXISTS');
    const hashed = await hashPassword(password);
    const user = await User.create({
      name, email, password: hashed,
      country,
      income_bracket,
    });
    const token = sign(user._id.toString(), user.role);
    return { token, user: toPublic(user) };
  },

  async login(email: string, password: string): Promise<{ token: string; user: PublicUser } | null> {
    // 1. Validate inputs
    if (!email || typeof email !== 'string') {
      console.error('[auth.service] login: email is missing or invalid');
      throw new Error('EMAIL_REQUIRED');
    }
    if (!password || typeof password !== 'string') {
      console.error('[auth.service] login: password is missing or invalid');
      throw new Error('PASSWORD_REQUIRED');
    }

    // 2. Check JWT_SECRET
    if (!JWT_SECRET) {
      console.error('[auth.service] login: JWT_SECRET is not set!');
      throw new Error('SERVER_CONFIG_ERROR');
    }

    // 3. MongoDB user lookup
    ensureDatabaseReady('login');

    let user: any;
    try {
      user = await User.findOne({ email: email.toLowerCase().trim() });
    } catch (dbErr: any) {
      console.error('[auth.service] login: MongoDB lookup failed:', dbErr?.message || dbErr);
      throw new Error('DATABASE_UNAVAILABLE');
    }

    if (!user) {
      console.log('[auth.service] login: no user found for email:', email);
      return null;
    }

    console.log(`[auth.service] login found user object:`, { id: user._id, email: user.email, role: user.role });

    // 4. bcrypt password compare
    let ok: boolean;
    try {
      ok = await comparePassword(password, user.password);
      console.log(`[auth.service] login bcrypt result:`, ok);
    } catch (bcryptErr: any) {
      console.error('[auth.service] login: bcrypt compare failed:', bcryptErr?.message || bcryptErr);
      throw new Error('PASSWORD_COMPARE_ERROR');
    }

    if (!ok) {
      console.log('[auth.service] login: password mismatch for:', email);
      return null;
    }

    // 5. Sign JWT
    let token: string;
    try {
      token = sign(user._id.toString(), user.role);
    } catch (jwtErr: any) {
      console.error('[auth.service] login: JWT sign failed:', jwtErr?.message || jwtErr);
      throw new Error('TOKEN_SIGN_ERROR');
    }

    console.log('[auth.service] login: success for', email, 'role:', user.role);
    return { token, user: toPublic(user) };
  },

  async issueResetToken(email: string): Promise<{ user: PublicUser; resetToken: string } | null> {
    ensureDatabaseReady('issueResetToken');
    const user = await User.findOne({ email });
    if (!user) return null;

    const resetToken = crypto.randomBytes(32).toString('hex');
    (user as any).resetPasswordToken = resetToken;
    (user as any).resetPasswordExpires = new Date(Date.now() + RESET_WINDOW_MS);
    await user.save();

    return { user: toPublic(user), resetToken };
  },

  async resetPassword(resetToken: string, newPassword: string): Promise<{ token: string; user: PublicUser } | null> {
    ensureDatabaseReady('resetPassword');
    const user = await User.findOne({
      resetPasswordToken: resetToken,
      resetPasswordExpires: { $gt: new Date() },
    } as any);

    if (!user) return null;

    (user as any).password = await hashPassword(newPassword);
    (user as any).resetPasswordToken = undefined;
    (user as any).resetPasswordExpires = undefined;
    await user.save();

    const token = sign(user._id.toString(), user.role);
    return { token, user: toPublic(user) };
  },

  async getPublicById(id: string): Promise<PublicUser | null> {
    ensureDatabaseReady('getPublicById');
    const user = await User.findById(id).select('-password').lean();
    return user ? toPublic(user) : null;
  },

  // ========= NEW: updateProfile =========
  async updateProfile(
    id: string,
    input: Partial<{ name: string; email: string; country: string; income_bracket: 'low' | 'middle' | 'high' }>
  ): Promise<PublicUser> {
    ensureDatabaseReady('updateProfile');
    const payload: any = {};

    if (typeof input.name === 'string' && input.name.trim()) {
      payload.name = input.name.trim();
    }

    if (typeof input.country === 'string') {
      payload.country = input.country.trim();
    }

    if (input.income_bracket) {
      const ok = ['low', 'middle', 'high'].includes(input.income_bracket);
      if (!ok) throw new Error('Invalid income_bracket');
      payload.income_bracket = input.income_bracket;
    }

    if (typeof input.email === 'string' && input.email.trim()) {
      const email = input.email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Invalid email format');
      // Make sure the new email is not used by another user
      const exists = await User.findOne({ email, _id: { $ne: id } }).lean();
      if (exists) throw new Error('Email already in use');
      payload.email = email;
    }

    const updated = await User.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
      context: 'query',
    }).lean();

    if (!updated) throw new Error('User not found');
    return toPublic(updated);
  },
};
