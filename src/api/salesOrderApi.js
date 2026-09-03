import { apiClient } from './client.js'

export const salesOrderApi = {
  list: (params) => apiClient.get('/sales-orders', { params }),
  get: (id) => apiClient.get(`/sales-orders/${id}`),
  create: (payload) => apiClient.post('/sales-orders', payload),
  update: (id, payload) => apiClient.put(`/sales-orders/${id}`, payload),
  complete: (id) => apiClient.patch(`/sales-orders/${id}/complete`),
  cancel: (id) => apiClient.patch(`/sales-orders/${id}/cancel`),
}
