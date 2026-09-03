import mongoose from 'mongoose'
import { serialize } from './plugins/serialize.js'

/** A team member listed in the "Users" screen. Distinct from a login `User`. */
const memberSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    roleId: { type: String, default: 'ROLE-STAFF' },
    status: { type: String, enum: ['pending', 'active', 'inactive'], default: 'pending' },
  },
  { timestamps: true },
)

memberSchema.index({ business: 1, email: 1 }, { unique: true })
memberSchema.plugin(serialize('userId'))

export const Member = mongoose.model('Member', memberSchema)
