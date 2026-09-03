import { apiClient } from './client.js'

export const returnApi = {
  list: (params) => apiClient.get('/returns', { params }),
  create: (payload) => apiClient.post('/returns', payload),
}
