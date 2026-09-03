import { apiClient } from './client.js'

export const productApi = {
  list: (params) => apiClient.get('/products', { params }),
  get: (id) => apiClient.get(`/products/${id}`),
  create: (payload) => apiClient.post('/products', payload),
  update: (id, payload) => apiClient.put(`/products/${id}`, payload),
  remove: (id) => apiClient.delete(`/products/${id}`),
}
