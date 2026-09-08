import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

/** Parses "45m" / "12h" / "7d" / "3600" (seconds) into milliseconds. */
export function parseDurationMs(value) {
  if (typeof value === 'number') return value * 1000
  const match = String(value).trim().match(/^(\d+)\s*(ms|s|m|h|d)?$/i)
  if (!match) return 45 * 60 * 1000
  const amount = Number(match[1])
  const unit = (match[2] || 's').toLowerCase()
  const scale = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }
  return amount * scale[unit]
}

export const tokenTimeToLiveMs = () => parseDurationMs(env.jwtExpiresIn)

export function signToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      businessId: user.business ? String(user.business) : null,
      role: user.role,
      tv: user.tokenVersion || 0,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  )
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret)
}
