import { apiClient } from './client.js'

export const customerApi = {
  list: (params) => apiClient.get('/customers', { params }),
  get: (id) => apiClient.get(`/customers/${id}`),
  create: (payload) => apiClient.post('/customers', payload),
  update: (id, payload) => apiClient.put(`/customers/${id}`, payload),
  archive: (id) => apiClient.patch(`/customers/${id}/archive`),
  remove: (id) => apiClient.delete(`/customers/${id}`),
}
