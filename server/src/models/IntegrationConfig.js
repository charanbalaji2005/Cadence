import mongoose from 'mongoose';

/**
 * Admin-managed settings for one external integration (today only "srm_ap").
 * Unset fields fall back to environment variables. Secrets are stored sealed (utils/secretBox).
 */
const integrationConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  enabled: { type: Boolean },
  directoryUrl: { type: String },
  verifyUrl: { type: String },
  allowDirectoryVerify: { type: Boolean, default: false },
  apiKeySealed: { type: String, select: false },
  apiKeyHint: { type: String, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastTest: {
    at: Date,
    ok: Boolean,
    target: String,
    httpStatus: Number,
    latencyMs: Number,
    message: String
  }
}, { timestamps: true, minimize: false });

export const IntegrationConfig = mongoose.model('IntegrationConfig', integrationConfigSchema);
