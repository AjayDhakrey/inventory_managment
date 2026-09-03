import mongoose from 'mongoose'

const roleSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    roleId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true },
)

roleSchema.index({ business: 1, roleId: 1 }, { unique: true })

roleSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  },
})

export const Role = mongoose.model('Role', roleSchema)

export const DEFAULT_PERMISSIONS = [
  'view_dashboard',
  'view_inventory',
  'create_product',
  'edit_product',
  'delete_product',
  'stock_in',
  'stock_out',
  'create_order',
  'process_pos_sale',
  'override_pos_price',
  'view_reports',
  'manage_users',
]

export const DEFAULT_ROLES = [
  { roleId: 'ROLE-ADMIN', name: 'Admin', description: 'Full access to this business', permissions: DEFAULT_PERMISSIONS },
  {
    roleId: 'ROLE-MANAGER',
    name: 'Manager',
    description: 'Manage inventory, purchases, and orders',
    permissions: ['view_dashboard', 'view_inventory', 'create_product', 'edit_product', 'stock_in', 'stock_out', 'create_order', 'process_pos_sale', 'override_pos_price', 'view_reports'],
  },
  {
    roleId: 'ROLE-STAFF',
    name: 'Staff',
    description: 'Handle products, stock, and orders',
    permissions: ['view_dashboard', 'view_inventory', 'create_product', 'stock_in', 'stock_out', 'create_order', 'process_pos_sale'],
  },
  { roleId: 'ROLE-ACCOUNTANT', name: 'Accountant', description: 'Manage payments and reports', permissions: ['view_dashboard', 'view_reports'] },
  { roleId: 'ROLE-SALESPERSON', name: 'Salesperson', description: 'Create orders and serve customers', permissions: ['view_dashboard', 'create_order', 'process_pos_sale'] },
]
