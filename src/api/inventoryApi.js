import { apiClient } from './client.js'

export const inventoryApi = {
  transactions: (params) => apiClient.get('/inventory/transactions', { params }),
  recordOperation: (payload) => apiClient.post('/inventory/operations', payload),
}
