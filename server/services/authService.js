import crypto from 'node:crypto'
import { User } from '../models/User.js'
import { Business } from '../models/Business.js'
import { Member } from '../models/Member.js'
import { Role, DEFAULT_PERMISSIONS } from '../models/Role.js'
import { ApiError } from '../utils/ApiError.js'
import { signToken } from '../middleware/auth.js'
import { env, isProduction } from '../config/env.js'
import { assert, requireFields, isEmail } from '../validators/assert.js'

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

async function buildSession(user) {
  const business = user.business ? await Business.findById(user.business) : null
  const member = user.business ? await Member.findOne({ business: user.business, $or: [{ account: user._id }, { email: user.email }] }) : null
  if (user.role === 'team' && (!member || member.status !== 'active')) {
    throw ApiError.forbidden(member?.status === 'inactive' ? 'Your team access has been deactivated.' : 'Your team invitation is not active.')
  }
  const role = member ? await Role.findOne({ business: user.business, roleId: member.roleId }) : null
  const account = { ...user.toJSON(), roleId: member?.roleId || (user.role === 'owner' ? 'ROLE-ADMIN' : null), roleName: role?.name || (user.role === 'owner' ? 'Admin' : 'Team member'), permissions: user.role === 'owner' ? DEFAULT_PERMISSIONS : role?.permissions || [] }
  return {
    token: signToken(user),
    account,
    user: account,
    business: business ? business.toJSON() : null,
  }
}

export async function register({ email, password, role = 'owner', name } = {}) {
  requireFields({ email, password }, ['email', 'password'])
  const normalizedEmail = String(email).toLowerCase().trim()
  assert(isEmail(normalizedEmail), 'Enter a valid email address.')
  assert(String(password).length >= 8, 'Your password must contain at least 8 characters.')
  assert(['owner', 'team'].includes(role), 'Invalid account type.')

  const exists = await User.findOne({ email: normalizedEmail })
  if (exists) throw ApiError.conflict('An account with this email already exists. Please sign in.')

  let invitation = null
  if (role === 'team') {
    invitation = await Member.findOne({ email: normalizedEmail, account: null, status: { $in: ['pending', 'active'] } })
    if (!invitation) throw ApiError.forbidden('Ask your business admin to add this email in Users before creating a team account.')
  }

  const user = await User.create({
    email: normalizedEmail,
    password,
    role,
    name: name?.trim() || normalizedEmail.split('@')[0],
    business: invitation?.business || null,
  })
  if (invitation) {
    const claimed = await Member.findOneAndUpdate(
      { _id: invitation._id, account: null, status: { $in: ['pending', 'active'] } },
      { $set: { account: user._id, status: 'active' } },
      { returnDocument: 'after' },
    )
    if (!claimed) {
      await User.deleteOne({ _id: user._id })
      throw ApiError.conflict('This invitation was already claimed. Please sign in instead.')
    }
  }
  return buildSession(user)
}

export async function login({ email, password, role } = {}) {
  requireFields({ email, password }, ['email', 'password'])
  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password')
  if (!user || !(await user.comparePassword(String(password)))) {
    throw ApiError.unauthorized('We could not find an account with those details.')
  }
  if (role && user.role !== role) throw ApiError.unauthorized(`This is a ${user.role === 'owner' ? 'shop owner' : 'team member'} account. Select the correct account type.`)
  return buildSession(user)
}

export async function currentSession(user) {
  return buildSession(user)
}

/**
 * Starts a password reset. Generates a single-use token (only its hash is
 * stored) valid for 30 minutes. To avoid leaking which emails are registered,
 * the response is always the same shape. Outside production the token is
 * returned directly so the flow works without an email service configured;
 * in production this is where an email would be sent instead.
 */
export async function requestPasswordReset({ email } = {}) {
  requireFields({ email }, ['email'])
  const normalizedEmail = String(email).toLowerCase().trim()
  const generic = { message: 'If that email has an account, a reset link has been issued.' }

  const user = await User.findOne({ email: normalizedEmail })
  if (!user) return generic

  const token = crypto.randomBytes(32).toString('hex')
  user.resetPasswordTokenHash = hashToken(token)
  user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS)
  await user.save()

  if (isProduction) {
    // TODO: send `${env.clientUrl}/reset?token=${token}` to user.email via your mail provider.
    return generic
  }
  return {
    ...generic,
    email: user.email,
    resetToken: token,
    resetUrl: `${env.clientUrl}/?reset=${token}`,
    expiresInMinutes: RESET_TOKEN_TTL_MS / 60000,
  }
}

export async function resetPassword({ token, password } = {}) {
  requireFields({ token, password }, ['token', 'password'])
  assert(String(password).length >= 8, 'Your password must contain at least 8 characters.')

  const user = await User.findOne({
    resetPasswordTokenHash: hashToken(String(token)),
    resetPasswordExpires: { $gt: new Date() },
  }).select('+password +resetPasswordTokenHash +resetPasswordExpires')

  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired. Request a new one.')

  user.password = String(password)
  user.resetPasswordTokenHash = null
  user.resetPasswordExpires = null
  await user.save()

  return buildSession(user)
}
