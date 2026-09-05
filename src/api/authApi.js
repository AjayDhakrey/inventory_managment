import { apiClient } from './client.js'

export const authApi = {
  register: (payload) => apiClient.post('/auth/register', payload, { auth: false }),
  login: (payload) => apiClient.post('/auth/login', payload, { auth: false }),
  forgotPassword: (payload) => apiClient.post('/auth/forgot-password', payload, { auth: false }),
  resetPassword: (payload) => apiClient.post('/auth/reset-password', payload, { auth: false }),
  me: () => apiClient.get('/auth/me'),
  saveOnboarding: (payload) => apiClient.patch('/auth/onboarding', payload),
}
