import { isDatabaseConnected } from '../config/db.js'
import { ApiError } from '../utils/ApiError.js'

/**
 * Guards data routes: if MongoDB is not connected yet, return a clear 503
 * instead of letting the request hang on Mongoose's command buffer.
 */
export function requireDatabase(_req, _res, next) {
  if (isDatabaseConnected()) return next()
  next(
    new ApiError(
      503,
      'The database is not connected. Check MONGODB_URI in server/.env and make sure MongoDB is running, then try again.',
    ),
  )
}
