import { useCallback, useState } from 'react'
import { userApi } from '../api/userApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'

const PERMISSION_CATALOG = ['view_dashboard', 'view_inventory', 'create_product', 'edit_product', 'delete_product', 'stock_in', 'stock_out', 'create_order', 'process_pos_sale', 'override_pos_price', 'view_reports', 'manage_users']

function UserManagement({ section, business, account }) {
  const load = useCallback(() => Promise.all([userApi.listMembers(), userApi.listRoles()]), [])
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], []])
  const [users, roles] = data

  const [selectedRoleId, setSelectedRoleId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  // Derive the active role during render: an explicit pick, "create role" (__new__), or the first role.
  const activeRole = selectedRoleId === '__new__' ? null : roles.find((role) => role.roleId === selectedRoleId) || roles[0] || null
  const activeRoleId = selectedRoleId === '__new__' ? '__new__' : activeRole?.roleId ?? null
  const setActiveRoleId = setSelectedRoleId
  const roleNames = roles.map((role) => role.name)
  const currentRole = (roleId) => roles.find((role) => role.roleId === roleId)?.name || 'Staff'
  const setUsers = (updater) => setData((current) => [updater(current[0]), current[1]])
  const setRoles = (updater) => setData((current) => [current[0], updater(current[1])])

  const handleUserSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const data = new FormData(event.currentTarget)
    const payload = { name: data.get('name').trim(), email: data.get('email').trim().toLowerCase(), role: data.get('role') }
    if (!payload.name || !payload.email) { setMessage({ type: 'error', text: 'Name and email are required.' }); return }
    setSaving(true)
    try {
      const saved = editingUser ? await userApi.updateMember(editingUser.userId, payload) : await userApi.createMember(payload)
      setUsers((list) => (editingUser ? list.map((item) => (item.userId === saved.userId ? saved : item)) : [...list, saved]))
      setFormOpen(false)
      setEditingUser(null)
      setMessage({ type: 'success', text: editingUser ? 'User updated.' : 'Team member added.' })
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not save the user.' })
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (user) => {
    try {
      const saved = await userApi.updateMember(user.userId, { status: user.status === 'active' ? 'inactive' : 'active' })
      setUsers((list) => list.map((item) => (item.userId === saved.userId ? saved : item)))
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not update the user.' })
    }
  }

  const handleRoleSubmit = async (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const payload = { roleId: activeRole?.roleId, name: data.get('name').trim(), description: data.get('description').trim(), permissions: activeRole?.permissions || [] }
    if (!payload.name) return
    try {
      const saved = await userApi.saveRole(payload)
      setRoles((list) => (list.some((role) => role.roleId === saved.roleId) ? list.map((role) => (role.roleId === saved.roleId ? saved : role)) : [...list, saved]))
      setActiveRoleId(saved.roleId)
      setMessage({ type: 'success', text: 'Role saved.' })
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not save the role.' })
    }
  }

  const togglePermission = async (permission) => {
    if (!activeRole) return
    const permissions = activeRole.permissions.includes(permission)
      ? activeRole.permissions.filter((item) => item !== permission)
      : [...activeRole.permissions, permission]
    try {
      const saved = await userApi.setRolePermissions(activeRole.roleId, permissions)
      setRoles((list) => list.map((role) => (role.roleId === saved.roleId ? saved : role)))
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not update permissions.' })
    }
  }

  if (section === 'Roles' || section === 'Permissions') return <section className="user-management"><div className="products-toolbar"><div><p className="dashboard-kicker">Users / {section}</p><h2>{section}</h2><p className="products-count">Reusable access controls for {business.name}</p></div><span className="business-filter">{roles.length} roles</span></div>{message && <p className={`form-status ${message.type}`}>{message.text}</p>}<AsyncBoundary loading={loading} error={error} onRetry={refetch}><div className="roles-layout"><div className="role-list">{roles.map((role) => <button className={activeRoleId === role.roleId ? 'active' : ''} type="button" key={role.roleId} onClick={() => setActiveRoleId(role.roleId)}><strong>{role.name}</strong><small>{role.description}</small></button>)}<button className="add-role-link" type="button" onClick={() => { setActiveRoleId('__new__'); setMessage(null) }}>+ Create role</button></div><div className="role-editor">{section === 'Roles' ? <form onSubmit={handleRoleSubmit}><div className="product-form-heading"><div><p className="dashboard-kicker">Role configuration</p><h3>{activeRole ? `Edit ${activeRole.name}` : 'Create a role'}</h3></div></div><label htmlFor="role-name">Role name</label><input id="role-name" name="name" defaultValue={activeRole?.name || ''} placeholder="e.g. Warehouse lead" key={activeRole?.roleId || 'new'} required /><label htmlFor="role-description">Description</label><textarea id="role-description" name="description" defaultValue={activeRole?.description || ''} placeholder="What can this role do?" key={`${activeRole?.roleId || 'new'}-desc`} /><button className="submit-button" type="submit">Save role <span>→</span></button></form> : <div><div className="product-form-heading"><div><p className="dashboard-kicker">Action access</p><h3>{activeRole?.name} permissions</h3></div></div><div className="permission-list">{PERMISSION_CATALOG.map((permission) => <label key={permission}><input type="checkbox" checked={activeRole?.permissions.includes(permission) || false} onChange={() => togglePermission(permission)} /> <span>{permission.replaceAll('_', ' ')}</span></label>)}</div></div>}</div></div></AsyncBoundary></section>

  return <section className="user-management"><div className="products-toolbar"><div><p className="dashboard-kicker">Users / Team members</p><h2>Users</h2><p className="products-count">{users.length} members in {business.name}</p></div><button className="submit-button product-add-button" type="button" onClick={() => { setEditingUser(null); setFormOpen(true); setMessage(null) }}>Add user <span>+</span></button></div>{formOpen && <form className="user-form" onSubmit={handleUserSubmit}><div><label htmlFor="user-name">Full name *</label><input id="user-name" name="name" defaultValue={editingUser?.name || ''} placeholder="e.g. Rahul Sharma" required /></div><div><label htmlFor="user-email">Email *</label><input id="user-email" name="email" type="email" defaultValue={editingUser?.email || ''} placeholder="rahul@business.com" required /></div><div><label htmlFor="user-role">Role *</label><select id="user-role" name="role" defaultValue={currentRole(editingUser?.roleId)}>{roleNames.map((role) => <option key={role}>{role}</option>)}</select></div><div className="user-form-actions"><button type="button" className="outline-button" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="submit-button" disabled={saving}>{saving ? 'Saving…' : 'Save user'} <span>→</span></button></div></form>}{message && <p className={`form-status ${message.type}`}>{message.text}</p>}<AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!users.length} emptyText="No team members yet. Add your first user."><div className="products-table users-table"><div className="product-table-row product-table-head"><span>User</span><span>Role</span><span>Status</span><span>Actions</span></div>{users.map((user) => <div className="product-table-row" key={user.userId}><span className="product-cell"><span className="user-avatar">{user.name[0].toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></span><span>{currentRole(user.roleId)}</span><span className={`user-status ${user.status}`}>{user.status}</span><span className="product-actions"><button type="button" onClick={() => { setEditingUser(user); setFormOpen(true) }}>Edit</button>{user.email !== account.email && <button type="button" onClick={() => toggleStatus(user)}>{user.status === 'active' ? 'Deactivate' : 'Activate'}</button>}</span></div>)}</div></AsyncBoundary></section>
}

export default UserManagement
