import { useCallback, useState } from 'react'
import { purchaseOrderApi } from '../api/purchaseOrderApi.js'
import { productApi } from '../api/productApi.js'
import { supplierApi } from '../api/supplierApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'

const emptyLine = () => ({ productId: '', quantity: 1, purchasePrice: '', discount: 0, tax: 0 })

function PurchaseOrders({ business }) {
  const load = useCallback(
    () => Promise.all([purchaseOrderApi.list(), productApi.list(), supplierApi.list({ status: 'active' })]),
    [],
  )
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], [], []])
  const [orders, products, suppliers] = data

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [viewingOrder, setViewingOrder] = useState(null)
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lineItems, setLineItems] = useState([emptyLine()])

  const setOrders = (updater) => setData((current) => [updater(current[0]), current[1], current[2]])
  const calculateItemTotal = (item) => { const base = Number(item.quantity || 0) * Number(item.purchasePrice || 0); return Math.max(0, base - Number(item.discount || 0) + Number(item.tax || 0)) }
  const updateLineItem = (index, field, value) => setLineItems(lineItems.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value, ...(field === 'productId' ? { purchasePrice: products.find((product) => product.productId === value)?.purchasePrice ?? '' } : {}) } : item))
  const openForm = (order = null) => { setEditingOrder(order); setLineItems(order ? order.items.map((item) => ({ productId: item.productId, quantity: item.quantity, purchasePrice: item.purchasePrice, discount: item.discount, tax: item.tax })) : [emptyLine()]); setFormOpen(true); setMessage(null) }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const data = new FormData(event.currentTarget)
    if (!suppliers.length) { setMessage({ type: 'error', text: 'Add an active supplier before creating a purchase order.' }); return }
    const validItems = lineItems.filter((item) => item.productId && Number(item.quantity) > 0 && Number(item.purchasePrice) >= 0)
    if (!validItems.length) { setMessage({ type: 'error', text: 'Add at least one product with a valid quantity and price.' }); return }
    const payload = {
      supplierId: data.get('supplierId'),
      expectedDeliveryDate: data.get('expectedDeliveryDate'),
      shippingCharges: Number(data.get('shippingCharges')) || 0,
      notes: data.get('notes').trim(),
      items: validItems.map((item) => ({ productId: item.productId, quantity: Number(item.quantity), purchasePrice: Number(item.purchasePrice), discount: Number(item.discount || 0), tax: Number(item.tax || 0) })),
    }
    setSaving(true)
    try {
      const saved = editingOrder && editingOrder.purchaseOrderId
        ? await purchaseOrderApi.update(editingOrder.purchaseOrderId, payload)
        : await purchaseOrderApi.create(payload)
      setOrders((list) => (editingOrder && editingOrder.purchaseOrderId ? list.map((item) => (item.purchaseOrderId === saved.purchaseOrderId ? saved : item)) : [saved, ...list]))
      setFormOpen(false)
      setEditingOrder(null)
      setMessage({ type: 'success', text: `${saved.orderNumber} saved successfully.` })
      event.currentTarget.reset()
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not save the purchase order.' })
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (order, status) => {
    try {
      const saved = await purchaseOrderApi.setStatus(order.purchaseOrderId, status)
      setOrders((list) => list.map((item) => (item.purchaseOrderId === saved.purchaseOrderId ? saved : item)))
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not update the order.' })
    }
  }
  const duplicateOrder = (order) => openForm({ ...order, purchaseOrderId: null, orderNumber: null, status: 'Draft', paymentStatus: 'Unpaid' })
  const filteredOrders = orders.filter((order) => (statusFilter === 'all' || order.status === statusFilter) && `${order.orderNumber} ${order.supplierName} ${order.status}`.toLowerCase().includes(search.toLowerCase()))

  return <section className="purchase-orders-page"><div className="products-toolbar"><div><p className="dashboard-kicker">Purchases / Purchase Orders</p><h2>Purchase orders</h2><p className="products-count">{orders.length} orders for {business.name}</p></div><button className="submit-button product-add-button" type="button" onClick={() => openForm()}>Create order <span>+</span></button></div>{message && <p className={`form-status ${message.type}`}>{message.text}</p>}<div className="products-controls"><div className="search-box"><span>⌕</span><input aria-label="Search purchase orders" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order number or supplier" /></div><select className="supplier-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter purchase orders"><option value="all">All statuses</option>{['Draft', 'Pending', 'Approved', 'Ordered', 'Partially Received', 'Received', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}</select></div>{formOpen && <form className="purchase-order-form" onSubmit={handleSubmit}><div className="product-form-heading"><div><p className="dashboard-kicker">{editingOrder && editingOrder.purchaseOrderId ? 'Update order' : 'New purchase order'}</p><h3>{editingOrder && editingOrder.orderNumber ? `Edit ${editingOrder.orderNumber}` : 'Create purchase order'}</h3></div><button type="button" className="close-button" onClick={() => setFormOpen(false)} aria-label="Close form">×</button></div><div className="purchase-order-fields"><div><label htmlFor="po-supplier">Supplier *</label><select id="po-supplier" name="supplierId" defaultValue={editingOrder?.supplierId || ''} required><option value="" disabled>Select supplier</option>{suppliers.map((supplier) => <option key={supplier.supplierId} value={supplier.supplierId}>{supplier.supplierName}</option>)}</select></div><div><label htmlFor="po-delivery">Expected delivery</label><input id="po-delivery" name="expectedDeliveryDate" type="date" defaultValue={editingOrder?.expectedDeliveryDate || ''} /></div><div><label htmlFor="po-shipping">Shipping / other charges</label><input id="po-shipping" name="shippingCharges" type="number" min="0" step="0.01" defaultValue={editingOrder?.shippingCharges || 0} /></div></div><div className="order-items-heading"><h4>Order items</h4><button type="button" className="outline-button" onClick={() => setLineItems([...lineItems, emptyLine()])}>Add item <span>+</span></button></div><div className="order-items">{lineItems.map((item, index) => <div className="order-item-row" key={`${index}-${item.productId}`}><select aria-label="Select product" value={item.productId} onChange={(event) => updateLineItem(index, 'productId', event.target.value)} required><option value="">Select product</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.name} ({product.sku})</option>)}</select><input aria-label="Quantity" type="number" min="1" value={item.quantity} onChange={(event) => updateLineItem(index, 'quantity', event.target.value)} placeholder="Qty" required /><input aria-label="Purchase price" type="number" min="0" step="0.01" value={item.purchasePrice} onChange={(event) => updateLineItem(index, 'purchasePrice', event.target.value)} placeholder="Price" required /><input aria-label="Discount" type="number" min="0" step="0.01" value={item.discount} onChange={(event) => updateLineItem(index, 'discount', event.target.value)} placeholder="Discount" /><input aria-label="Tax" type="number" min="0" step="0.01" value={item.tax} onChange={(event) => updateLineItem(index, 'tax', event.target.value)} placeholder="Tax" /><strong>{business.currency} {calculateItemTotal(item).toFixed(2)}</strong>{lineItems.length > 1 && <button type="button" className="remove-item" onClick={() => setLineItems(lineItems.filter((_, itemIndex) => itemIndex !== index))}>×</button>}</div>)}</div><label htmlFor="po-notes">Notes</label><textarea id="po-notes" name="notes" defaultValue={editingOrder?.notes || ''} placeholder="Delivery or order notes" /><div className="product-form-actions"><button type="button" className="outline-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save order'} <span>→</span></button></div></form>}<AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filteredOrders.length} emptyText={orders.length ? 'No purchase orders match your filters.' : 'No purchase orders yet.'}><div className="purchase-orders-table products-table"><div className="purchase-order-row purchase-order-head"><span>Order</span><span>Supplier</span><span>Total</span><span>Status</span><span>Actions</span></div>{filteredOrders.map((order) => <div className="purchase-order-row" key={order.purchaseOrderId}><span><strong>{order.orderNumber}</strong><small>{new Date(order.createdAt).toLocaleDateString()} · {order.items.length} items</small></span><span>{order.supplierName}</span><span className="price-cell">{business.currency} {order.totalAmount.toFixed(2)}</span><span className={`po-status ${order.status.toLowerCase().replaceAll(' ', '-')}`}>{order.status}</span><span className="product-actions"><button type="button" onClick={() => setViewingOrder(order)}>View</button><button type="button" onClick={() => openForm(order)}>Edit</button><button type="button" onClick={() => duplicateOrder(order)}>Duplicate</button>{!['Received', 'Cancelled'].includes(order.status) && <button type="button" onClick={() => updateStatus(order, 'Cancelled')}>Cancel</button>}</span></div>)}</div></AsyncBoundary>{viewingOrder && <div className="supplier-modal-backdrop" role="presentation" onClick={() => setViewingOrder(null)}><article className="supplier-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="product-form-heading"><div><p className="dashboard-kicker">Purchase order details</p><h3>{viewingOrder.orderNumber}</h3></div><button type="button" className="close-button" onClick={() => setViewingOrder(null)} aria-label="Close purchase order">×</button></div><div className="supplier-detail-grid"><div><small>Supplier</small><strong>{viewingOrder.supplierName}</strong></div><div><small>Status</small><strong>{viewingOrder.status} · {viewingOrder.paymentStatus}</strong></div><div><small>Expected delivery</small><strong>{viewingOrder.expectedDeliveryDate || 'Not set'}</strong></div><div><small>Total</small><strong>{business.currency} {viewingOrder.totalAmount.toFixed(2)}</strong></div></div><div className="order-detail-items">{viewingOrder.items.map((item) => <div key={item.productId}><span>{item.productName} × {item.quantity}</span><strong>{business.currency} {item.total.toFixed(2)}</strong></div>)}</div></article></div>}</section>
}

export default PurchaseOrders
