/** Consistent success envelopes: { success, data, message? }. */
export function ok(res, data, message) {
  return res.status(200).json({ success: true, data, ...(message ? { message } : {}) })
}

export function created(res, data, message) {
  return res.status(201).json({ success: true, data, ...(message ? { message } : {}) })
}
