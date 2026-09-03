import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ['owner', 'team'], default: 'owner' },
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },
    resetPasswordTokenHash: { type: String, default: null, select: false },
    resetPasswordExpires: { type: Date, default: null, select: false },
  },
  { timestamps: true },
)

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return
  this.password = await bcrypt.hash(this.password, 10)
})

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password)
}

userSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.accountId = String(ret._id)
    delete ret.password
    delete ret.resetPasswordTokenHash
    delete ret.resetPasswordExpires
    delete ret.__v
    return ret
  },
})

export const User = mongoose.model('User', userSchema)
