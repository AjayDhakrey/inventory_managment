import mongoose from 'mongoose'
import { ApiError } from '../utils/ApiError.js'
import { isProduction } from '../config/env.js'

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`))
}

// eslint-disable-next-line no-unused-vars -- Express requires the 4-arg signature.
export function errorHandler(error, _req, res, _next) {
  let statusCode = error.statusCode || 500
  let message = error.message || 'Something went wrong.'
  let details

  if (error instanceof mongoose.Error.ValidationError) {
    statusCode = 400
    message = 'Validation failed.'
    details = Object.fromEntries(Object.entries(error.errors).map(([key, value]) => [key, value.message]))
  } else if (error instanceof mongoose.Error.CastError) {
    statusCode = 400
    message = `Invalid ${error.path}: ${error.value}`
  } else if (error.code === 11000) {
    statusCode = 409
    message = `Duplicate value for ${Object.keys(error.keyValue || {}).join(', ') || 'a unique field'}.`
  } else if (error.name === 'MulterError') {
    statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    message = error.code === 'LIMIT_FILE_SIZE' ? 'The upload exceeds the 15 MB file limit.' : `Invalid upload: ${error.message}`
  }

  const unexpected = statusCode >= 500 && !error.isOperational

  if (unexpected) {
    console.error(error)
    if (isProduction) message = 'Something went wrong. Please try again.'
  } else if (statusCode >= 500) {
    console.warn(`${statusCode} ${message}`)
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { errors: details } : {}),
    ...(!isProduction && unexpected ? { stack: error.stack } : {}),
  })
}
