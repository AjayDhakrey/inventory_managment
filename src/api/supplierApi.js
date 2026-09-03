import { apiClient } from './client.js'

export const supplierApi = {
  list: (params) => apiClient.get('/suppliers', { params }),
  get: (id) => apiClient.get(`/suppliers/${id}`),
  create: (payload) => apiClient.post('/suppliers', payload),
  update: (id, payload) => apiClient.put(`/suppliers/${id}`, payload),
  archive: (id) => apiClient.patch(`/suppliers/${id}/archive`),
  remove: (id) => apiClient.delete(`/suppliers/${id}`),
}
