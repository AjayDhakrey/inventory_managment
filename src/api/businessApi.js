import { apiClient } from './client.js'

export const businessApi = {
  create: (payload) => apiClient.post('/businesses', payload),
  me: () => apiClient.get('/businesses/me'),
  update: (payload) => apiClient.patch('/businesses/me', payload),
  remove: () => apiClient.delete('/businesses/me'),
}
