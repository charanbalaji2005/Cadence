import mongoose from 'mongoose';

/** Alerts shared by all admins; read and cleared state is tracked per admin. */
const adminNotificationSchema = new mongoose.Schema({
  type: { type: String, required: true },
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  link: { type: String, default: '' },
  dedupeKey: { type: String, default: '' },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  clearedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: { createdAt: true, updatedAt: false } });
adminNotificationSchema.index({ createdAt: -1 });
adminNotificationSchema.index({ dedupeKey: 1, createdAt: -1 });

export const EXPORT_KINDS = ['users', 'logins', 'sessions', 'visitors', 'pageviews', 'activity', 'audit', 'security', 'competitions', 'results'];
export const EXPORT_FORMATS = ['csv', 'json', 'xlsx'];

/** A background export. The file is private, served only to admins, and deleted when it expires. */
const exportJobSchema = new mongoose.Schema({
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedByLabel: String,
  kind: { type: String, enum: EXPORT_KINDS, required: true },
  format: { type: String, enum: EXPORT_FORMATS, required: true },
  filters: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  status: { type: String, enum: ['queued', 'running', 'done', 'failed', 'expired'], default: 'queued' },
  progress: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  rows: { type: Number, default: 0 },
  bytes: { type: Number, default: 0 },
  file: { type: String, default: '' },
  error: { type: String, default: '' },
  finishedAt: Date,
  expiresAt: Date,
  downloads: { type: Number, default: 0 }
}, { timestamps: true, minimize: false });
exportJobSchema.index({ createdAt: -1 });

/** A generated daily, weekly or monthly report: a snapshot of real numbers for a period. */
const reportSchema = new mongoose.Schema({
  type: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  from: { type: Date, required: true },
  to: { type: Date, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByLabel: String
}, { timestamps: { createdAt: true, updatedAt: false } });
reportSchema.index({ createdAt: -1 });

export const DEFAULT_SETTINGS = {
  retention: { pageViewDays: 90, visitorSessionDays: 90, activityDays: 180, loginEventDays: 180, securityEventDays: 365, errorDays: 30, exportHours: 24 },
  security: { failedLoginWarn: 5, failedLoginCritical: 15, multiAccountIp: 3, windowMinutes: 15 },
  application: {
    registrationsOpen: true,
    trackingEnabled: true,
    respectDoNotTrack: true,
    maintenanceMode: false,
    maintenanceStart: '',
    maintenanceEnd: '',
    maintenanceMessage: 'Cadence is temporarily under scheduled system maintenance. We are performing optimizations and will be back online shortly.'
  }
};

/** Single document holding admin-configurable settings. */
const appSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  retention: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  security: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  application: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: true, minimize: false });

export const AdminNotification = mongoose.model('AdminNotification', adminNotificationSchema);
export const ExportJob = mongoose.model('ExportJob', exportJobSchema);
export const Report = mongoose.model('Report', reportSchema);
export const AppSettings = mongoose.model('AppSettings', appSettingsSchema);
