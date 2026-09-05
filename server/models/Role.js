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
  'view_returns',
  'create_returns',
  'complete_returns',
  'process_refunds',
  'adjust_refunds',
  'cancel_returns',
  'view_variants',
  'manage_variants',
  'view_replenishment',
  'manage_replenishment',
  'manage_promotions',
  'manage_loyalty',
  'manage_coupons',
  'manage_gift_cards',
  'view_clothing_reports',
  'manage_cashier_shift',
]

export const DEFAULT_ROLES = [
  { roleId: 'ROLE-ADMIN', name: 'Admin', description: 'Full access to this business', permissions: DEFAULT_PERMISSIONS },
  {
    roleId: 'ROLE-MANAGER',
    name: 'Manager',
    description: 'Manage inventory, purchases, and orders',
    permissions: ['view_dashboard', 'view_inventory', 'create_product', 'edit_product', 'stock_in', 'stock_out', 'create_order', 'process_pos_sale', 'override_pos_price', 'view_reports', 'view_returns', 'create_returns', 'complete_returns', 'process_refunds', 'view_variants', 'manage_variants', 'view_replenishment', 'manage_replenishment', 'manage_promotions', 'manage_loyalty', 'manage_coupons', 'manage_gift_cards', 'view_clothing_reports', 'manage_cashier_shift'],
  },
  {
    roleId: 'ROLE-STAFF',
    name: 'Staff',
    description: 'Handle products, stock, and orders',
    permissions: ['view_dashboard', 'view_inventory', 'create_product', 'stock_in', 'stock_out', 'create_order', 'process_pos_sale', 'view_returns', 'create_returns', 'view_variants', 'view_replenishment'],
  },
  { roleId: 'ROLE-ACCOUNTANT', name: 'Accountant', description: 'Manage payments and reports', permissions: ['view_dashboard', 'view_reports', 'view_returns', 'process_refunds'] },
  { roleId: 'ROLE-SALESPERSON', name: 'Salesperson', description: 'Create orders and serve customers', permissions: ['view_dashboard', 'create_order', 'process_pos_sale', 'view_returns', 'create_returns'] },
]
