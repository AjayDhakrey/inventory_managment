import mongoose from 'mongoose'
import { ApiError } from '../utils/ApiError.js'

export function assert(condition, message, statusCode = 400) {
  if (!condition) throw new ApiError(statusCode, message)
}

export function requireFields(body, fields) {
  const missing = fields.filter((field) => {
    const value = body?.[field]
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  })
  assert(missing.length === 0, `Missing required field(s): ${missing.join(', ')}`)
}

export function toObjectId(value, label = 'id') {
  assert(mongoose.isValidObjectId(value), `Invalid ${label}.`)
  return new mongoose.Types.ObjectId(String(value))
}

export function toNumber(value, label, { min, integer } = {}) {
  const num = Number(value)
  assert(Number.isFinite(num), `${label} must be a number.`)
  assert(min === undefined || num >= min, `${label} must be at least ${min}.`)
  assert(!integer || Number.isInteger(num), `${label} must be a whole number.`)
  return num
}

export function isEmail(value) {
  return /^\S+@\S+\.\S+$/.test(String(value || ''))
}
