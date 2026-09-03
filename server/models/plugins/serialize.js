/**
 * Adds a stable string id under a legacy-friendly name (e.g. `productId`) while
 * keeping `_id`, and strips `__v`. Keeps the frontend working with the same
 * field names it already uses, backed by real MongoDB ObjectIds.
 */
export function serialize(idField) {
  return function serializePlugin(schema) {
    const transform = (_doc, ret) => {
      if (ret._id != null) ret[idField] = String(ret._id)
      if (ret.business != null) ret.businessId = String(ret.business)
      delete ret.__v
      return ret
    }
    schema.set('toJSON', { virtuals: false, transform })
    schema.set('toObject', { virtuals: false, transform })
  }
}
