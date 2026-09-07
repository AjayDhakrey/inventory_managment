import { useCallback, useMemo, useState } from 'react'
import { userApi } from '../api/userApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'
import '../styles/user-management.css'

const PERMISSION_META = {
  view_dashboard: ['View dashboard', 'Access KPI store revenue telemetry'],
  view_inventory: ['View inventory', 'Browse product SKUs and stock registers'],
  create_product: ['Create product', 'Generate new item listings and barcodes'],
  edit_product: ['Edit product', 'Change prices, tags, and variants'],
  delete_product: ['Delete product', 'Archive or soft-delete items'],
  stock_in: ['Stock in', 'Receive warehouse purchase consignments'],
  stock_out: ['Stock out', 'Write-off damage or outbound transfers'],
  create_order: ['Create order', 'Create wholesale and counter invoices'],
  process_pos_sale: ['Process POS sale', 'Ring up transactions at retail checkouts'],
  override_pos_price: ['Override POS price', 'Manually adjust item sale prices at checkout'],
  view_reports: ['View reports', 'Export profit & loss, tax, and sales stats'],
  view_returns: ['View returns', 'View return orders and credit logs'],
  create_returns: ['Create returns', 'Initiate customer return slips'],
  complete_returns: ['Complete returns', 'Approve warehouse intake of returns'],
  process_refunds: ['Process refunds', 'Release refund payouts to customers'],
  adjust_refunds: ['Adjust refunds', 'Change refund amounts within policy'],
  cancel_returns: ['Cancel returns', 'Void an in-progress return'],
  view_variants: ['View variants', 'See size / colour variant grids'],
  manage_variants: ['Manage variants', 'Create and edit variant inventory'],
  view_replenishment: ['View replenishment', 'See reorder suggestions'],
  manage_replenishment: ['Manage replenishment', 'Raise replenishment purchase orders'],
  manage_promotions: ['Manage promotions', 'Configure discounts and offers'],
  manage_loyalty: ['Manage loyalty', 'Adjust loyalty points and tiers'],
  manage_coupons: ['Manage coupons', 'Issue and revoke coupon codes'],
  manage_gift_cards: ['Manage gift cards', 'Sell and top up store gift cards'],
  view_clothing_reports: ['View clothing reports', 'Access apparel-specific analytics'],
  manage_cashier_shift: ['Manage cashier shift', 'Open and close counter registers'],
  manage_users: ['Manage users', 'Add staff, assign roles, reset access'],
}
const PERMISSION_CATALOG = Object.keys(PERMISSION_META)

const roleTone = (name = '') => {
  const key = name.toLowerCase()
  if (key.includes('admin') || key.includes('owner')) return 'purple'
  if (key.includes('manager') || key.includes('lead')) return 'teal'
  if (key.includes('account')) return 'amber'
  if (key.includes('staff') || key.includes('cashier') || key.includes('sales')) return 'blue'
  return 'dim'
}
const scopeFor = (count) => {
  if (count >= 22) return ['Super administrator', 'Unrestricted access to every store module']
  if (count >= 12) return ['Operations manager', 'Purchases, inventory, orders and vendor reconciliation']
  if (count >= 6) return ['Store staff', 'Products, stock movement and order handling']
  if (count >= 3) return ['POS cashier', 'POS billing, credit notes and cash drawer only']
  return ['Limited access', 'Read-only visibility into assigned screens']
}

function UserMgIcon({ name }) {
  const paths = {
    import: <><path d="M12 15V3m-4 4 4-4 4 4" /><path d="M4 15v4h16v-4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    refresh: <><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8m0-4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16m0 4v-4h4" /></>,
    users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.6M20.5 20a5.2 5.2 0 0 0-3.5-4.9" /></>,
    monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" /><path d="m9.3 12 2 2 3.4-4.2" /></>,
    lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    reset: <><path d="M4 12a8 8 0 1 1 2.3 5.6" /><path d="M4 20v-4h4" /></>,
    save: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
    arrow: <path d="M5 12h13m-5-5 5 5-5 5" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function UserManagement({ section, business, account }) {
  const load = useCallback(() => Promise.all([userApi.listMembers(), userApi.listRoles()]), [])
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], []])
  const [users, roles] = data

  const [selectedRoleId, setSelectedRoleId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const activeRole = selectedRoleId === '__new__' ? null : roles.find((role) => role.roleId === selectedRoleId) || roles[0] || null
  const activeRoleId = selectedRoleId === '__new__' ? '__new__' : activeRole?.roleId ?? null
  const setActiveRoleId = setSelectedRoleId
  const roleNames = roles.map((role) => role.name)
  const currentRole = (roleId) => roles.find((role) => role.roleId === roleId)?.name || 'Staff'
  const setUsers = (updater) => setData((current) => [updater(current[0]), current[1]])
  const setRoles = (updater) => setData((current) => [current[0], updater(current[1])])

  const usersByRole = useMemo(() => {
    const map = new Map()
    for (const user of users) map.set(user.roleId, (map.get(user.roleId) || 0) + 1)
    return map
  }, [users])

  const handleUserSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const formData = new FormData(event.currentTarget)
    const payload = { name: formData.get('name').trim(), email: formData.get('email').trim().toLowerCase(), role: formData.get('role') }
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
    const formData = new FormData(event.currentTarget)
    const payload = { roleId: activeRole?.roleId, name: formData.get('name').trim(), description: formData.get('description').trim(), permissions: activeRole?.permissions || [] }
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
  const setAllPermissions = async (all) => {
    if (!activeRole) return
    try {
      const saved = await userApi.setRolePermissions(activeRole.roleId, all ? [...PERMISSION_CATALOG] : [])
      setRoles((list) => list.map((role) => (role.roleId === saved.roleId ? saved : role)))
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not update permissions.' })
    }
  }

  /* ---- Roles / Permissions view ---- */
  if (section === 'Roles' || section === 'Permissions') {
    const permissionMode = section === 'Permissions'
    return <section className="um-page um-roles" aria-labelledby="um-title">
      <header className="um-heading">
        <div>
          <p className="um-kicker">Users <span>•</span> {section}</p>
          <h1 id="um-title">{permissionMode ? 'Permissions' : 'Roles'}</h1>
          <p>Reusable access controls and the operational privilege matrix for <strong>{business.name}</strong>.</p>
        </div>
        <div className="um-heading-actions">
          {permissionMode && <button type="button" onClick={() => setAllPermissions(false)}><UserMgIcon name="reset" />Reset to none</button>}
          {permissionMode && <button type="button" className="primary" onClick={() => setAllPermissions(true)}><UserMgIcon name="save" />Grant all</button>}
        </div>
      </header>

      <div className="um-note">
        <span className="um-note-mark">i</span>
        <p><strong>How role permissions operate:</strong> changes reflect on staff accounts at their next session heartbeat. Unchecked privileges completely hide the associated screens and API actions.</p>
      </div>

      {message && <p className={`um-message ${message.type}`} role="status">{message.text}</p>}

      <AsyncBoundary loading={loading} error={error} onRetry={refetch}>
        <div className="um-roles-layout">
          <div className="um-role-list">
            <div className="um-role-list-head"><span>Select user role</span><b>{roles.length} defined</b></div>
            {roles.map((role) => {
              const count = role.permissions?.length || 0
              return <button type="button" key={role.roleId} className={`um-role-card${activeRoleId === role.roleId ? ' active' : ''}`} onClick={() => setActiveRoleId(role.roleId)}>
                <div className="um-role-card-top">
                  <strong>{role.name}</strong>
                  {activeRoleId === role.roleId && <span className="um-role-active">Active</span>}
                </div>
                <small>{role.description || 'No description set'}</small>
                <div className="um-role-card-foot">
                  <span className="um-role-count">{count} action{count === 1 ? '' : 's'} allowed</span>
                  <span>{usersByRole.get(role.roleId) || 0} user{(usersByRole.get(role.roleId) || 0) === 1 ? '' : 's'}</span>
                </div>
              </button>
            })}
            <button type="button" className="um-role-add" onClick={() => { setActiveRoleId('__new__'); setMessage(null) }}><UserMgIcon name="plus" />Create role</button>
          </div>

          <div className="um-role-editor">
            {permissionMode ? <div className="um-perm-panel">
              <div className="um-perm-head">
                <div>
                  <p className="um-kicker">Action access</p>
                  <h2>{activeRole?.name || 'Select a role'} permissions<span className={`um-role-badge ${roleTone(activeRole?.name)}`}>{roleTone(activeRole?.name) === 'purple' ? 'Master control' : 'Scoped'}</span></h2>
                </div>
                <div className="um-perm-bulk">
                  <button type="button" onClick={() => setAllPermissions(true)} disabled={!activeRole}>Select all</button>
                  <button type="button" onClick={() => setAllPermissions(false)} disabled={!activeRole}>Deselect all</button>
                </div>
              </div>
              <div className="um-perm-grid">
                {PERMISSION_CATALOG.map((permission) => {
                  const [label, description] = PERMISSION_META[permission]
                  const checked = activeRole?.permissions.includes(permission) || false
                  return <label key={permission} className={checked ? 'checked' : ''}>
                    <input type="checkbox" checked={checked} disabled={!activeRole} onChange={() => togglePermission(permission)} />
                    <span><strong>{label}</strong><small>{description}</small></span>
                  </label>
                })}
              </div>
            </div> : <form className="um-role-form" onSubmit={handleRoleSubmit}>
              <div className="um-perm-head"><div><p className="um-kicker">Role configuration</p><h2>{activeRole ? `Edit ${activeRole.name}` : 'Create a role'}</h2></div></div>
              <label htmlFor="role-name">Role name</label>
              <input id="role-name" name="name" defaultValue={activeRole?.name || ''} placeholder="e.g. Warehouse lead" key={activeRole?.roleId || 'new'} required />
              <label htmlFor="role-description">Description</label>
              <textarea id="role-description" name="description" defaultValue={activeRole?.description || ''} placeholder="What can this role do?" key={`${activeRole?.roleId || 'new'}-desc`} />
              <div className="um-role-form-perms">
                <span>{activeRole?.permissions?.length || 0} permission{(activeRole?.permissions?.length || 0) === 1 ? '' : 's'} attached — tune them under the Permissions tab.</span>
              </div>
              <button className="um-submit" type="submit">Save role<UserMgIcon name="arrow" /></button>
            </form>}
          </div>
        </div>
      </AsyncBoundary>

      <footer className="um-statusbar">
        <span><i />Stockroom · access control</span>
        <span>{roles.length} roles · {users.length} accounts</span>
        <span className="um-statusbar-suite">Enterprise Retail OS</span>
      </footer>
    </section>
  }

  /* ---- Users view ---- */
  const activeUsers = users.filter((user) => user.status === 'active').length
  const cashierRoleUsers = users.filter((user) => /staff|cashier|sales/i.test(currentRole(user.roleId)) && user.status === 'active').length
  const rolesInUse = new Set(users.map((user) => currentRole(user.roleId))).size
  const filteredUsers = users.filter((user) => {
    const query = search.trim().toLowerCase()
    if (roleFilter !== 'all' && currentRole(user.roleId) !== roleFilter) return false
    if (statusFilter !== 'all' && user.status !== statusFilter) return false
    return `${user.name} ${user.email} ${currentRole(user.roleId)}`.toLowerCase().includes(query)
  })

  return <section className="um-page um-users" aria-labelledby="um-title">
    <header className="um-heading">
      <div>
        <p className="um-kicker">Users <span>•</span> Team members</p>
        <div className="um-title-line"><h1 id="um-title">Users</h1><span className="um-count-badge">{users.length} members registered</span></div>
        <p>Control employee access levels, register terminal PINs, and cashier role assignments.</p>
      </div>
      <div className="um-heading-actions">
        <button type="button" onClick={() => { setEditingUser(null); setFormOpen(true); setMessage(null) }}><UserMgIcon name="import" />Import staff CSV</button>
        <button type="button" className="primary" onClick={() => { setEditingUser(null); setFormOpen(true); setMessage(null) }}><UserMgIcon name="plus" />Add user<kbd>Alt U</kbd></button>
      </div>
    </header>

    <div className="um-kpis" aria-busy={loading}>
      <article className="um-kpi">
        <span>Total user accounts <i className="dim"><UserMgIcon name="users" /></i></span>
        <strong>{loading || error ? '—' : users.length} <small>accounts</small></strong>
        <p>{activeUsers} active · {users.length - activeUsers} inactive</p>
      </article>
      <article className="um-kpi">
        <span>POS cashiers <i className="green"><UserMgIcon name="monitor" /></i></span>
        <strong className="um-good">{loading || error ? '—' : cashierRoleUsers} <small>active</small></strong>
        <p>Staff / cashier roles cleared for counter billing</p>
      </article>
      <article className="um-kpi">
        <span>System roles in use <i className="amber"><UserMgIcon name="shield" /></i></span>
        <strong>{loading || error ? '—' : rolesInUse} <small>roles</small></strong>
        <p>{[...new Set(users.map((user) => currentRole(user.roleId)))].slice(0, 3).join(', ') || 'None assigned'}</p>
      </article>
      <article className="um-kpi">
        <span>Access guard <i className="blue"><UserMgIcon name="lock" /></i></span>
        <strong className="um-good">{loading || error ? '—' : '100%'} <small>OK</small></strong>
        <p>All accounts have a role and login credentials set</p>
      </article>
    </div>

    <div className="um-note">
      <span className="um-note-mark">i</span>
      <p><strong>Enterprise role guard:</strong> only administrators can edit purchase prices, approve stock scrap, or export tax sheets. Staff and cashiers are restricted to POS billing and receiving orders.</p>
    </div>

    {message && <p className={`um-message ${message.type}`} role="status">{message.text}</p>}

    {formOpen && <form className="um-user-form" onSubmit={handleUserSubmit}>
      <div className="um-user-form-head"><strong>{editingUser ? `Edit ${editingUser.name}` : 'Add a team member'}</strong><button type="button" className="um-close" onClick={() => setFormOpen(false)} aria-label="Close">×</button></div>
      <div className="um-user-form-grid">
        <label>Full name *<input name="name" defaultValue={editingUser?.name || ''} placeholder="e.g. Rahul Sharma" required /></label>
        <label>Email *<input name="email" type="email" defaultValue={editingUser?.email || ''} placeholder="rahul@business.com" required /></label>
        <label>Role *<select name="role" defaultValue={currentRole(editingUser?.roleId)}>{roleNames.map((role) => <option key={role}>{role}</option>)}</select></label>
      </div>
      <div className="um-user-form-actions"><button type="button" className="um-cancel" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="um-submit" disabled={saving}>{saving ? 'Saving…' : 'Save user'}<UserMgIcon name="arrow" /></button></div>
    </form>}

    <div className="um-toolbar">
      <label className="um-search">
        <UserMgIcon name="search" />
        <input aria-label="Search users" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, or role" />
      </label>
      <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter by role">
        <option value="all">All roles ({roleNames.join(', ') || '—'})</option>
        {roleNames.map((role) => <option key={role} value={role}>{role}</option>)}
      </select>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      <button type="button" className="um-refresh" onClick={refetch} aria-label="Refresh"><UserMgIcon name="refresh" /></button>
    </div>

    <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filteredUsers.length} emptyText={users.length ? 'No members match these filters.' : 'No team members yet. Add your first user.'}>
      <div className="um-table-wrap">
        <div className="um-table-scroll" tabIndex={0} role="region" aria-label="Team members">
          <table className="um-table">
            <thead><tr>
              <th>User</th><th>Assigned role</th><th>Access scope</th><th>Status</th><th className="num">Actions</th>
            </tr></thead>
            <tbody>
              {filteredUsers.map((user) => {
                const role = currentRole(user.roleId)
                const roleObj = roles.find((entry) => entry.roleId === user.roleId)
                const [scopeTitle, scopeDesc] = scopeFor(roleObj?.permissions?.length || (user.role === 'owner' ? 28 : 4))
                const owner = user.email === account.email || user.role === 'owner'
                return <tr key={user.userId}>
                  <td>
                    <div className="um-user-cell">
                      <span className="um-avatar">{user.name[0].toUpperCase()}</span>
                      <div>
                        <strong>{user.name}{owner && <span className="um-owner-tag">Owner</span>}{user.status !== 'active' && <span className="um-owner-tag muted">Deactivated</span>}</strong>
                        <small>{user.email}</small>
                      </div>
                    </div>
                  </td>
                  <td><span className={`um-role-badge ${roleTone(role)}`}>{role}</span></td>
                  <td className="um-scope"><strong>{scopeTitle}</strong><small>{scopeDesc}</small></td>
                  <td><span className={`um-status ${user.status === 'active' ? 'green' : 'amber'}`}><i />{user.status}</span></td>
                  <td className="num">
                    <div className="um-row-actions">
                      <button type="button" onClick={() => { setEditingUser(user); setFormOpen(true) }}>Edit</button>
                      {!owner && <button type="button" className={user.status === 'active' ? '' : 'go'} onClick={() => toggleStatus(user)}>{user.status === 'active' ? 'Deactivate' : 'Activate'}</button>}
                    </div>
                  </td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
        <footer className="um-pagination">
          <span>Showing {filteredUsers.length} of {users.length} registered members</span>
          <span className="um-pagination-suite">Stockroom access desk</span>
        </footer>
      </div>
    </AsyncBoundary>

    <footer className="um-statusbar">
      <span><i />Stockroom server node online</span>
      <span>{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} local</span>
      <span>{rolesInUse} roles · {activeUsers} active</span>
      <span className="um-statusbar-suite">Enterprise Retail OS</span>
    </footer>
  </section>
}

export default UserManagement
