import { apiClient } from './client.js'
const q = (params = {}) => new URLSearchParams(Object.entries(params).filter(([, v]) => v && v !== 'all')).toString()
export const clothingApi = {
  variants: (params) => apiClient.get(`/clothing/variants?${q(params)}`), saveVariants: (productId, variants) => apiClient.put(`/clothing/products/${productId}/variants`, { variants }),
  variantStock: (productId, variantId, body) => apiClient.post(`/clothing/products/${productId}/variants/${variantId}/stock`, body), barcode: (code) => apiClient.get(`/clothing/barcode/${encodeURIComponent(code)}`),
  replenishment: (params) => apiClient.get(`/clothing/replenishment?${q(params)}`), draftPO: (body) => apiClient.post('/clothing/replenishment/purchase-order', body),
  list: (kind, params) => apiClient.get(`/clothing/${kind}?${q(params)}`), create: (kind, body) => apiClient.post(`/clothing/${kind}`, body),
  update: (kind, id, body) => apiClient.patch(`/clothing/${kind}/${id}`, body),
  loyalty: (customerId) => apiClient.get(`/clothing/loyalty/${customerId}`), adjustLoyalty: (customerId, body) => apiClient.post(`/clothing/loyalty/${customerId}`, body),
  shifts: () => apiClient.get('/clothing/shifts'), startShift: (openingCash) => apiClient.post('/clothing/shifts', { openingCash }), closeShift: (id, actualClosingCash) => apiClient.patch(`/clothing/shifts/${id}/close`, { actualClosingCash }), cashMovement: (direction, amount) => apiClient.post('/clothing/shifts/cash-movement', { direction, amount }), reports: () => apiClient.get('/clothing/reports'),
}
