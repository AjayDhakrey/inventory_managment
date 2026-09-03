import { apiClient } from './client.js'

export const userApi = {
  listMembers: () => apiClient.get('/users'),
  createMember: (payload) => apiClient.post('/users', payload),
  updateMember: (id, payload) => apiClient.put(`/users/${id}`, payload),
  listRoles: () => apiClient.get('/users/roles/all'),
  saveRole: (payload) => apiClient.post('/users/roles', payload),
  setRolePermissions: (roleId, permissions) => apiClient.patch(`/users/roles/${roleId}/permissions`, { permissions }),
}
