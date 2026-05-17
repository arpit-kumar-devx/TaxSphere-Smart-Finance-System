import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemSettings extends Document {
  appName: string;
  logoUrl: string;
  maintenanceMode: boolean;
  notificationEnabled: boolean;
  paymentMode: 'test' | 'live';
  taxYear: string;
}

const systemSettingsSchema = new Schema<ISystemSettings>({
  appName: { type: String, default: 'TaxSphere' },
  logoUrl: { type: String, default: '' },
  maintenanceMode: { type: Boolean, default: false },
  notificationEnabled: { type: Boolean, default: true },
  paymentMode: { type: String, enum: ['test', 'live'], default: 'test' },
  taxYear: { type: String, default: '2024-25' }
}, { timestamps: true });

export default mongoose.model<ISystemSettings>('SystemSettings', systemSettingsSchema);
