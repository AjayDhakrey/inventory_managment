import { apiClient } from './client.js'

export const receivingApi = {
  list: (params) => apiClient.get('/receiving', { params }),
  pendingOrders: () => apiClient.get('/receiving/pending-orders'),
  create: (payload) => apiClient.post('/receiving', payload),
}
