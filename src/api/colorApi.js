import { apiClient } from './client.js'

export const colorApi = {
  list: (params) => apiClient.get('/colors', { params }),
  create: (payload) => apiClient.post('/colors', payload),
  update: (colorId, payload) => apiClient.patch(`/colors/${colorId}`, payload),
}
