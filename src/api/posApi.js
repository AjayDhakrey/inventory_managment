import { apiClient } from './client.js'
export const posApi = {
  catalog: (params) => apiClient.get('/pos/catalog', { params }),
  customers: (params) => apiClient.get('/pos/customers', { params }),
  checkout: (payload) => apiClient.post('/pos/checkout', payload),
  invoices: (params) => apiClient.get('/pos/invoices', { params }),
  invoice: (id) => apiClient.get(`/pos/invoices/${id}`),
}
