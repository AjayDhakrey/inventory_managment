import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

const colorSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
    hexCode: { type: String, trim: true, uppercase: true, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true },
)

colorSchema.index({ business: 1, normalizedName: 1 }, { unique: true })
colorSchema.plugin(serialize('colorId'))

export const Color = mongoose.model('Color', colorSchema)
