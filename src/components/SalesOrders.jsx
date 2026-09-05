import { useCallback, useState } from 'react'
import { salesOrderApi } from '../api/salesOrderApi.js'
import { productApi } from '../api/productApi.js'
import { customerApi } from '../api/customerApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'
import CreditSalesList from './CreditSalesList.jsx'
import OrderDetails from './OrderDetails.jsx'

const emptyItem = () => ({ productId: '', quantity: 1, sellingPrice: '', discount: 0, tax: 0 })

function SalesOrders({ business, creditSales = false, section = "Credit Sales" }) {
  const load = useCallback(() => Promise.all([salesOrderApi.list(), productApi.list(), customerApi.list()]), [])
  const { data, loading, error, refetch, setData } = useResource(load, [], [[], [], []])
  const [orders, products, customers] = data

  const [formOpen, setFormOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [viewingOrder, setViewingOrder] = useState(null)
  const [items, setItems] = useState([emptyItem()])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  const setOrders = (updater) => setData((current) => [updater(current[0]), current[1], current[2]])
  const itemTotal = (item) => Math.max(0, Number(item.quantity || 0) * Number(item.sellingPrice || 0) - Number(item.discount || 0) + Number(item.tax || 0))
  const totals = items.reduce((result, item) => ({ totalAmount: result.totalAmount + itemTotal(item) }), { totalAmount: 0 })
  const updateItem = (index, field, value) => setItems(items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value, ...(field === 'productId' ? { sellingPrice: products.find((product) => product.productId === value)?.sellingPrice ?? '' } : {}) } : item))
  const openForm = (order = null) => { setEditingOrder(order); setItems(order ? order.items.map((item) => ({ productId: item.productId, quantity: item.quantity, sellingPrice: item.sellingPrice, discount: item.discount, tax: item.tax })) : [emptyItem()]); setFormOpen(true); setMessage(null) }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    if (!customers.length) { setMessage({ type: 'error', text: 'Add a customer before creating an order.' }); return }
    const data = new FormData(event.currentTarget)
    const validItems = items.filter((item) => item.productId && Number(item.quantity) > 0 && Number(item.sellingPrice) >= 0)
    if (!validItems.length) { setMessage({ type: 'error', text: 'Add at least one product with a valid quantity and price.' }); return }
    const payload = {
      customerId: data.get('customerId'),
      notes: data.get('notes').trim(),
      items: validItems.map((item) => ({ productId: item.productId, quantity: Number(item.quantity), sellingPrice: Number(item.sellingPrice), discount: Number(item.discount || 0), tax: Number(item.tax || 0) })),
    }
    setSaving(true)
    try {
      const saved = editingOrder
        ? await salesOrderApi.update(editingOrder.orderId, payload)
        : await salesOrderApi.create(payload)
      setOrders((list) => (editingOrder ? list.map((item) => (item.orderId === saved.orderId ? saved : item)) : [saved, ...list]))
      setFormOpen(false)
      setEditingOrder(null)
      setMessage({ type: 'success', text: `${saved.orderNumber} saved successfully.` })

    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not save the order.' })
    } finally {
      setSaving(false)
    }
  }

  const completeOrder = async (order) => {
    if (order.status === 'Completed') return
    try {
      const saved = await salesOrderApi.complete(order.orderId)
      setOrders((list) => list.map((item) => (item.orderId === saved.orderId ? saved : item)))
      const freshProducts = await productApi.list()
      setData((current) => [current[0].map((item) => (item.orderId === saved.orderId ? saved : item)), freshProducts, current[2]])
      setMessage({ type: 'success', text: `${order.orderNumber} completed. Inventory was reduced.` })
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not complete the order.' })
    }
  }
  const cancelOrder = async (order) => {
    if (order.status === 'Completed') return
    try {
      const saved = await salesOrderApi.cancel(order.orderId)
      setOrders((list) => list.map((item) => (item.orderId === saved.orderId ? saved : item)))
    } catch (caught) {
      setMessage({ type: 'error', text: caught.message || 'Could not cancel the order.' })
    }
  }
  const visibleOrders = orders.filter((order) => (statusFilter === 'all' || order.status === statusFilter) && `${order.orderNumber} ${order.customerName} ${order.status}`.toLowerCase().includes(search.toLowerCase()))

  return <section className="sales-orders-page">{creditSales && <CreditSalesList section={section} orders={orders} business={business} loading={loading} error={error} refetch={refetch} onCreate={() => openForm()} onView={setViewingOrder} onEdit={openForm} onComplete={completeOrder} onCancel={cancelOrder} />}{!creditSales && <><div className="products-toolbar"><div><p className="dashboard-kicker">Orders / Sales</p><h2>Orders</h2><p className="products-count">{orders.length} sales orders for {business.name}</p></div><button className="submit-button product-add-button" type="button" onClick={() => openForm()}>Create order <span>+</span></button></div>{message && <p className={`form-status ${message.type}`}>{message.text}</p>}<div className="products-controls"><div className="search-box"><span>⌕</span><input aria-label="Search orders" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order number or customer" /></div><select className="supplier-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter orders"><option value="all">All statuses</option><option>Pending</option><option>Completed</option><option>Cancelled</option></select></div></>}{creditSales && message && <p className={`form-status ${message.type}`}>{message.text}</p>}{formOpen && <div className={creditSales ? "credit-form-backdrop" : undefined}><form role={creditSales ? "dialog" : undefined} aria-modal={creditSales || undefined} aria-label="Sales order form" className="purchase-order-form" onSubmit={handleSubmit}><div className="product-form-heading"><div><p className="dashboard-kicker">{editingOrder ? 'Update order' : 'New sales order'}</p><h3>{editingOrder ? `Edit ${editingOrder.orderNumber}` : 'Create sales order'}</h3></div><button type="button" className="close-button" onClick={() => setFormOpen(false)} aria-label="Close form">×</button></div><div className="purchase-order-fields"><div><label htmlFor="order-customer">Customer *</label><select id="order-customer" name="customerId" defaultValue={editingOrder?.customerId || ''} required><option value="" disabled>Select customer</option>{customers.map((customer) => <option key={customer.customerId} value={customer.customerId}>{customer.name}</option>)}</select></div><div className="field-wide"><label htmlFor="order-notes">Notes</label><input id="order-notes" name="notes" defaultValue={editingOrder?.notes || ''} placeholder="Order notes" /></div></div><div className="order-items-heading"><h4>Order items</h4><button type="button" className="outline-button" onClick={() => setItems([...items, emptyItem()])}>Add item <span>+</span></button></div><div className="order-items">{items.map((item, index) => <div className="order-item-row" key={index}><select aria-label="Select product" value={item.productId} onChange={(event) => updateItem(index, 'productId', event.target.value)} required><option value="">Select product</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.name} ({product.sku})</option>)}</select><input aria-label="Quantity" type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} required /><input aria-label="Selling price" type="number" min="0" step="0.01" value={item.sellingPrice} onChange={(event) => updateItem(index, 'sellingPrice', event.target.value)} required /><input aria-label="Discount" type="number" min="0" value={item.discount} onChange={(event) => updateItem(index, 'discount', event.target.value)} /><input aria-label="Tax" type="number" min="0" value={item.tax} onChange={(event) => updateItem(index, 'tax', event.target.value)} /><strong>{business.currency} {itemTotal(item).toFixed(2)}</strong>{items.length > 1 && <button type="button" className="remove-item" onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))}>×</button>}</div>)}</div><p className="order-total">Total: <strong>{business.currency} {totals.totalAmount.toFixed(2)}</strong></p><div className="product-form-actions"><button type="button" className="outline-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save order'} <span>→</span></button></div></form></div>}{!creditSales && <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!visibleOrders.length} emptyText={orders.length ? 'No orders match your filters.' : 'No orders yet.'}><div className="purchase-orders-table products-table"><div className="purchase-order-row purchase-order-head"><span>Order</span><span>Customer</span><span>Total</span><span>Status</span><span>Actions</span></div>{visibleOrders.map((order) => <div className="purchase-order-row" key={order.orderId}><span><strong>{order.orderNumber}</strong><small>{new Date(order.createdAt).toLocaleDateString()} · {order.items.length} items</small></span><span>{order.customerName}</span><span className="price-cell">{business.currency} {order.totalAmount.toFixed(2)}</span><span className={`po-status ${order.status.toLowerCase()}`}>{order.status}</span><span className="product-actions"><button type="button" onClick={() => setViewingOrder(order)}>View</button>{order.status !== 'Completed' && order.status !== 'Cancelled' && <><button type="button" onClick={() => openForm(order)}>Edit</button><button type="button" onClick={() => completeOrder(order)}>Complete</button><button type="button" onClick={() => cancelOrder(order)}>Cancel</button></>}</span></div>)}</div></AsyncBoundary>}{viewingOrder && <OrderDetails order={viewingOrder} business={business} onClose={() => setViewingOrder(null)} />}</section>
}

export default SalesOrders





