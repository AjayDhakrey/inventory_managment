import { apiClient } from './client.js'

export const purchaseOrderApi = {
  list: (params) => apiClient.get('/purchase-orders', { params }),
  get: (id) => apiClient.get(`/purchase-orders/${id}`),
  create: (payload) => apiClient.post('/purchase-orders', payload),
  update: (id, payload) => apiClient.put(`/purchase-orders/${id}`, payload),
  setStatus: (id, status) => apiClient.patch(`/purchase-orders/${id}/status`, { status }),
}
