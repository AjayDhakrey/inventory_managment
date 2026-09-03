import { apiClient } from './client.js'

export const reportApi = {
  summary: () => apiClient.get('/reports/summary'),
}
