export class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message)
    this.statusCode = statusCode
    this.details = details
    this.isOperational = true
  }

  static badRequest(message = 'Invalid request.', details) {
    return new ApiError(400, message, details)
  }

  static unauthorized(message = 'Authentication required.') {
    return new ApiError(401, message)
  }

  static forbidden(message = 'You do not have access to this resource.') {
    return new ApiError(403, message)
  }

  static notFound(message = 'Resource not found.') {
    return new ApiError(404, message)
  }

  static conflict(message = 'This record already exists.') {
    return new ApiError(409, message)
  }
}
