import { apiClient } from './client.js'

export const paymentApi = {
  list: (params) => apiClient.get('/payments', { params }),
  create: (payload) => apiClient.post('/payments', payload),
}
