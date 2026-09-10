import { ApiError } from '../utils/ApiError.js'

// bcrypt only hashes the first 72 bytes; anything longer is silently truncated.
const MAX_PASSWORD_BYTES = 72
const MIN_PASSWORD_LENGTH = 8
const PASSPHRASE_LENGTH = 12

// A short list of the most-guessed passwords. Not exhaustive by design — the
// structural checks below catch most weak inputs; swap in `zxcvbn` if you want
// dictionary-grade scoring.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword',
  '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'qwertyuiop',
  'iloveyou', 'welcome1', 'admin123', 'letmein1', 'football1', 'monkey12',
  'abc12345', 'changeme', 'stockroom', 'stockroom1', 'inventory', 'business1',
])

const hasLower = (s) => /[a-z]/.test(s)
const hasUpper = (s) => /[A-Z]/.test(s)
const hasDigit = (s) => /\d/.test(s)
const hasSymbol = (s) => /[^A-Za-z0-9]/.test(s)

function isLowVariety(password) {
  // All one character, or a run of sequential letters/digits.
  if (/^(.)\1+$/.test(password)) return true
  const sequences = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const lower = password.toLowerCase()
  return sequences.includes(lower) || sequences.split('').reverse().join('').includes(lower)
}

/**
 * Throws ApiError(400) when `password` is too weak. `email` (optional) is used
 * to reject passwords built from the address.
 */
export function assertStrongPassword(password, email) {
  const value = String(password || '')

  if (value.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(`Your password must contain at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_PASSWORD_BYTES) {
    throw ApiError.badRequest(`Your password must be at most ${MAX_PASSWORD_BYTES} characters.`)
  }
  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    throw ApiError.badRequest('That password is too common. Choose something harder to guess.')
  }
  if (isLowVariety(value)) {
    throw ApiError.badRequest('That password is too predictable. Choose something harder to guess.')
  }

  const localPart = String(email || '').split('@')[0]?.toLowerCase()
  if (localPart && localPart.length >= 3 && value.toLowerCase().includes(localPart)) {
    throw ApiError.badRequest('Your password should not contain your email address.')
  }

  const classes = [hasLower(value), hasUpper(value), hasDigit(value), hasSymbol(value)].filter(Boolean).length
  if (value.length < PASSPHRASE_LENGTH && classes < 3) {
    throw ApiError.badRequest('Use a longer password, or mix upper- and lower-case letters, numbers, and a symbol.')
  }
}

export { MIN_PASSWORD_LENGTH, MAX_PASSWORD_BYTES }
