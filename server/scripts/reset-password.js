/**
 * Admin password reset (for when you're locked out of your own workspace).
 *
 *   npm run reset-password -- you@email.com "NewPassword123"
 *
 * Sets the password directly in MongoDB (bcrypt-hashed via the model hook).
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js'
import { User } from '../models/User.js'

const [email, password] = process.argv.slice(2)

if (!email || !password) {
  console.error('Usage: npm run reset-password -- <email> <newPassword>')
  process.exit(1)
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.')
  process.exit(1)
}

try {
  await connectDatabase()
  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password')
  if (!user) {
    console.error(`No account found for ${email}`)
    process.exit(1)
  }
  user.password = password
  user.resetPasswordTokenHash = null
  user.resetPasswordExpires = null
  user.tokenVersion = (user.tokenVersion || 0) + 1
  user.failedLoginAttempts = 0
  user.lockUntil = null
  await user.save()
  console.log(`Password updated for ${user.email}. All existing sessions were signed out.`)
  await disconnectDatabase()
  process.exit(0)
} catch (error) {
  console.error(error.message)
  await disconnectDatabase()
  process.exit(1)
}
