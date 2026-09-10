import { apiClient } from './client.js'

export const authApi = {
  register: (payload) => apiClient.post('/auth/register', payload),
  login: (payload) => apiClient.post('/auth/login', payload),
  logout: () => apiClient.post('/auth/logout'),
  logoutAll: () => apiClient.post('/auth/logout-all'),
  forgotPassword: (payload) => apiClient.post('/auth/forgot-password', payload),
  resetPassword: (payload) => apiClient.post('/auth/reset-password', payload),
  me: () => apiClient.get('/auth/me'),
  saveOnboarding: (payload) => apiClient.patch('/auth/onboarding', payload),
}
