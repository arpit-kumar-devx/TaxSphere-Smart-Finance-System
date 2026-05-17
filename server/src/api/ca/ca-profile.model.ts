import mongoose from 'mongoose';

const caProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    experience: { type: Number, default: 0 },
    fullName: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    qualification: { type: String, default: '' },
    membershipNumber: { type: String, default: '' },
    specialization: { type: String, default: 'Income Tax' },
    yearsOfExperience: { type: Number, default: 0 },
    officeAddress: { type: String, default: '' },
    professionalBio: { type: String, default: '' },
    profilePhoto: { type: String, default: '' },
    digitalSignature: { type: String, default: '' },
    availabilityStatus: { type: String, default: 'available' },
    serviceFee: { type: Number, default: 0 },
    supportedTaxYears: { type: String, default: '' },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    bio: { type: String, default: '' },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('CAProfile', caProfileSchema);
