import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const notificationSchema = new mongoose.Schema({
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true, trim: true, index: true },
  category: { type: String, enum: ['inventory', 'purchases', 'sales', 'payments', 'suppliers', 'returns', 'users', 'system'], required: true },
  severity: { type: String, enum: ['critical', 'warning', 'info', 'success'], default: 'info' },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  relatedEntity: { type: String, default: '', trim: true },
  relatedEntityId: { type: String, default: '', trim: true },
  navigationTarget: { type: String, required: true, trim: true },
  dedupeKey: { type: String, required: true, trim: true },
  readAt: { type: Date, default: null },
  dismissedAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true })

notificationSchema.index({ business: 1, recipient: 1, dedupeKey: 1 }, { unique: true })
notificationSchema.index({ business: 1, recipient: 1, dismissedAt: 1, createdAt: -1 })
notificationSchema.plugin(serialize('notificationId'))

export const Notification = mongoose.model('Notification', notificationSchema)
