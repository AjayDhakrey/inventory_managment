import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const MAX_FAILED_LOGINS = 8
const LOCK_DURATION_MS = 15 * 60 * 1000

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ['owner', 'team'], default: 'owner' },
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },
    onboarding: {
      type: new mongoose.Schema({
        status: { type: String, enum: ['pending', 'in_progress', 'completed'], default: 'pending' },
        currentStep: { type: Number, min: 1, max: 7, default: 1 },
        setupVersion: { type: Number, default: 1 },
        completedAt: { type: Date, default: null },
        draft: { type: mongoose.Schema.Types.Mixed, default: {} },
      }, { _id: false }),
      default: undefined,
    },
    // Bumped on password reset and "sign out everywhere". Any token minted with
    // an older value is rejected by the auth middleware.
    tokenVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
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

userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil.getTime() > Date.now())
}

/** Record a failed sign-in; lock the account once the threshold is crossed. */
userSchema.methods.registerFailedLogin = async function registerFailedLogin() {
  const attempts = (this.failedLoginAttempts || 0) + 1
  const update = attempts >= MAX_FAILED_LOGINS
    ? { failedLoginAttempts: 0, lockUntil: new Date(Date.now() + LOCK_DURATION_MS) }
    : { failedLoginAttempts: attempts, lockUntil: null }
  await this.constructor.updateOne({ _id: this._id }, { $set: update })
  return update.lockUntil ? Math.ceil(LOCK_DURATION_MS / 60000) : null
}

/** Clear the failed-attempt counter after a successful sign-in. */
userSchema.methods.clearLoginLock = async function clearLoginLock() {
  if (!this.failedLoginAttempts && !this.lockUntil) return
  await this.constructor.updateOne({ _id: this._id }, { $set: { failedLoginAttempts: 0, lockUntil: null } })
}

userSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.accountId = String(ret._id)
    delete ret.password
    delete ret.tokenVersion
    delete ret.failedLoginAttempts
    delete ret.lockUntil
    delete ret.resetPasswordTokenHash
    delete ret.resetPasswordExpires
    delete ret.__v
    return ret
  },
})

export const User = mongoose.model('User', userSchema)
export { MAX_FAILED_LOGINS, LOCK_DURATION_MS }
