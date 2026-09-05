import { useState } from 'react'
import AsyncBoundary from './AsyncBoundary.jsx'
import '../styles/credit-sales.css'

export default function CreditSalesList({ section = "Credit Sales", orders, business, loading, error, refetch, onCreate, onView, onEdit, onComplete, onCancel }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const money = (value) => `${business.currency === 'INR' ? '₹' : business.currency || '₹'}${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const sum = (list, field = 'totalAmount') => list.reduce((total, order) => total + Number(order[field] || 0), 0)
  const completed = orders.filter((order) => order.status === 'Completed')
  const pending = orders.filter((order) => order.status === 'Pending')
  const cancelled = orders.filter((order) => order.status === 'Cancelled')
  const settled = orders.filter((order) => order.status !== 'Cancelled' && order.paymentStatus === 'Paid')
  const filtered = orders.filter((order) => (status === 'all' || order.status === status) && `${order.orderNumber} ${order.customerName}`.toLowerCase().includes(search.trim().toLowerCase()))
  const pages = Math.max(1, Math.ceil(filtered.length / 7))
  const currentPage = Math.min(page, pages)
  const start = (currentPage - 1) * 7
  const selectStatus = (value) => { setStatus(value); setPage(1) }
  const exportOrders = () => {
    const cell = (value) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`
    const rows = [['Order ID', 'Customer', 'Total amount', 'Currency', 'Status', 'Payment status'], ...filtered.map((order) => [order.orderNumber, order.customerName, order.totalAmount, business.currency, order.status, order.paymentStatus])]
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'credit-sales.csv'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className="credit-sales">
    {!loading && !error && <div className="credit-summary">
      <article><div className="credit-stat-label">Total sales <span>Excl. cancelled</span></div><strong>{money(sum(orders.filter((order) => order.status !== 'Cancelled')))}</strong><p>Across {orders.length - cancelled.length} sales orders</p></article>
      <article><div className="credit-stat-label">Settled orders <span>{orders.length ? (settled.length / orders.length * 100).toFixed(1) : '0'}% rate</span></div><strong>{settled.length}<small> / {orders.length}</small></strong><p className="credit-positive">{money(sum(orders.filter((order) => order.status !== 'Cancelled'), 'amountPaid'))} collected</p></article>
      <article><div className="credit-stat-label">Pending orders <span className="credit-amber">To complete</span></div><strong>{pending.length}<small> orders</small></strong><p>Awaiting completion <b>{money(sum(pending))}</b></p></article>
      <article><div className="credit-stat-label">Cancelled <span className="credit-red">Cancelled</span></div><strong>{cancelled.length}<small> orders</small></strong><p className="credit-negative">Cancelled value <b>{money(sum(cancelled))}</b></p></article>
    </div>}
    <div className="credit-toolbar"><div><p className="credit-breadcrumb">Orders <span>/</span> {section}</p><div className="credit-title"><h2>Orders</h2><span className="credit-count">● {orders.length} sales orders for {business.name}</span></div></div><div className="credit-buttons"><button onClick={exportOrders} disabled={loading || !!error || !filtered.length}>↥ Export</button><button className="credit-create" onClick={onCreate}>Create order <span>＋</span></button></div></div>
    <div className="credit-controls"><label className="credit-search"><span aria-hidden="true">⌕</span><input aria-label="Search order number or customer" placeholder="Search order number or customer…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label><select aria-label="Filter order status" value={status} onChange={(event) => selectStatus(event.target.value)}><option value="all">All statuses</option><option>Pending</option><option>Completed</option><option>Cancelled</option></select><div className="credit-tabs" aria-label="Order status shortcuts">{[['all', 'All', orders.length], ['Completed', 'Completed', completed.length], ['Cancelled', 'Cancelled', cancelled.length]].map(([value, label, count]) => <button key={value} aria-pressed={status === value} onClick={() => selectStatus(value)}>{label} <span>{count}</span></button>)}</div></div>
    <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!filtered.length} emptyText={orders.length ? 'No orders match your filters.' : 'No orders yet. Create your first sales order.'}>
      <div className="credit-table-card"><div className="credit-table-scroll"><table className="credit-table"><thead><tr><th>Order ID</th><th>Customer</th><th>Total amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.slice(start, start + 7).map((order, index) => <tr key={order.orderId}>
        <td><strong className="credit-order-id">{order.orderNumber}</strong><small>{new Date(order.createdAt).toLocaleDateString()} <span>·</span> <em>{order.items.length} {order.items.length === 1 ? 'item' : 'items'}</em></small></td>
        <td><div className="credit-customer"><span className={`credit-avatar tone-${index % 5}`} aria-hidden="true">{(order.customerName || 'Customer').split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}</span><div>{order.customerName || 'Customer'}<small>{order.channel === 'POS' ? 'Point of sale' : order.billingType === 'wholesale' ? 'Wholesale customer' : 'Sales order'}</small></div></div></td>
        <td><strong className={order.status === 'Cancelled' ? 'credit-void' : ''}>{money(order.totalAmount)}</strong><small className={order.paymentStatus === 'Paid' ? 'credit-positive' : ''}>{order.paymentSummary?.length ? order.paymentSummary.map((payment) => payment.method).join(' / ') : order.paymentStatus}</small></td>
        <td><span className={`credit-status ${order.status.toLowerCase()}`}>● {order.status}</span></td>
        <td><div className="credit-row-actions"><button onClick={() => onView(order)}>View <span aria-hidden="true">›</span></button>{order.status === 'Pending' && <><button onClick={() => onEdit(order)}>Edit</button><button onClick={() => onComplete(order)}>Complete</button><button onClick={() => onCancel(order)}>Cancel</button></>}</div></td>
      </tr>)}</tbody></table></div><footer className="credit-pagination"><p>Showing <strong>{start + 1}–{Math.min(start + 7, filtered.length)}</strong> of <strong>{filtered.length}</strong> orders <span>· Page {currentPage} of {pages}</span></p><div><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="credit-current" aria-current="page">{currentPage}</button><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer></div>
    </AsyncBoundary>
  </div>
}

