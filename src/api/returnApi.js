import { apiClient } from './client.js'

export const returnApi = {
  list: (params) => apiClient.get('/returns', { params }),
  eligibleOrders: (params) => apiClient.get('/returns/eligible-orders/list', { params }),
  create: (payload) => apiClient.post('/returns', payload),
  get: (returnId) => apiClient.get(`/returns/${returnId}`),
  refund: (returnId, payload) => apiClient.post(`/returns/${returnId}/refunds`, payload),
  updateRefund: (returnId, refundId, payload) => apiClient.patch(`/returns/${returnId}/refunds/${refundId}`, payload),
  cancel: (returnId) => apiClient.patch(`/returns/${returnId}/cancel`),
}
