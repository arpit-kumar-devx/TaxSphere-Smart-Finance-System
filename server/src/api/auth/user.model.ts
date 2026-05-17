import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: { type: String, required: true, minlength: 6 },

    country: { type: String, default: 'US' },
    income_bracket: { type: String, enum: ['low', 'middle', 'high'], default: 'middle' },
    profilePhoto: { type: String, default: '' },
    phone: { type: String, default: '' },
    dob: { type: Date, default: null },
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'], default: 'prefer_not_to_say' },
    city: { type: String, default: '' },
    address: { type: String, default: '' },
    occupation: { type: String, default: '' },
    workType: { type: String, enum: ['freelancer', 'salaried', 'business', 'other'], default: 'other' },
    panNumber: { type: String, default: '' },
    aadhaarNumber: { type: String, default: '' },
    taxRegime: { type: String, enum: ['old', 'new'], default: 'new' },
    incomeBracket: {
      type: String,
      enum: ['under_5l', '5l_10l', '10l_25l', '25l_50l', '50l_plus'],
      default: 'under_5l',
    },
    notificationPreferences: {
      productUpdates: { type: Boolean, default: true },
      taxAlerts: { type: Boolean, default: true },
      reminders: { type: Boolean, default: true },
    },
    emailPreferences: {
      statements: { type: Boolean, default: true },
      newsletters: { type: Boolean, default: false },
    },
    privacyPreferences: {
      profileVisibility: { type: String, enum: ['private', 'team'], default: 'private' },
      analyticsConsent: { type: Boolean, default: true },
    },

    resetPasswordToken: { type: String, default: undefined },
    resetPasswordExpires: { type: Date, default: undefined },

    /** ITR SaaS: USER | CA | ADMIN */
    role: {
      type: String,
      enum: ['USER', 'CA', 'ADMIN'],
      default: 'USER',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      index: true,
    },

    /** Assigned CA for USER role */
    assignedCA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    caProfile: {
      qualification: { type: String, default: '' },
      experience: { type: Number, default: 0 },
      specialization: [{ type: String }],
      bio: { type: String, default: '' },
      rating: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });

export default mongoose.model('User', userSchema);
