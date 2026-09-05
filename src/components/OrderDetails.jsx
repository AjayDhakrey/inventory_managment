import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import '../styles/order-details.css'

export default function OrderDetails({ order, business, onClose }) {
  const dialog = useRef(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const previous = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current.showModal()
    return () => { document.body.style.overflow = previousOverflow; previous?.focus() }
  }, [])
  const money = (value) => `${business.currency === 'INR' ? '₹' : business.currency || '₹'}${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const initials = (value) => String(value || 'Customer').split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  const print = () => {
    document.body.classList.add('printing-sales-order')
    const cleanup = () => { document.body.classList.remove('printing-sales-order'); window.removeEventListener('afterprint', cleanup) }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }
  return createPortal(<dialog className="order-receipt" ref={dialog} aria-labelledby="receipt-title" onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) onClose() }}>
    <div className="receipt-body">
      <header className="receipt-header"><div className="receipt-eyebrow">Sales order details <span>{order.billingType === 'wholesale' ? 'Wholesale' : 'Retail'} {order.channel === 'POS' ? 'POS' : 'Order'}</span></div><button className="receipt-close" aria-label="Close order details" onClick={onClose}>×</button><div className="receipt-title"><h2 id="receipt-title">{order.orderNumber}</h2><button aria-label="Copy order number" onClick={async () => { try { await navigator.clipboard.writeText(order.orderNumber); setCopied(true) } catch { setCopied(false) } }}>{copied ? 'Copied' : '⧉'}</button></div><p>{new Date(order.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p></header>
      <div className="receipt-parties"><div><h3>Customer</h3><div className="receipt-customer"><span className="receipt-avatar">{initials(order.customerName)}</span><div><strong>{order.customerName || 'Customer'}</strong><small>{order.channel === 'POS' ? 'Counter checkout' : 'Sales order'} · {order.billingType === 'wholesale' ? 'Wholesale' : 'Retail'}</small></div></div></div><div><h3>Status</h3><span className={`receipt-status ${order.status.toLowerCase()}`}>● {order.status} · {order.paymentStatus}</span>{order.paymentSummary?.map((payment, index) => <small key={index}>Payment: {payment.method}{payment.reference ? ` · Ref: ${payment.reference}` : ''}</small>)}</div></div>
      <section className="receipt-items"><h3>Purchased items ({order.items.length})</h3>{order.items.map((item, index) => <div className="receipt-item" key={`${item.productId}-${index}`}><span className="receipt-product-icon">{initials(item.productName)}</span><div><strong>{item.productName} × {item.quantity}</strong><small>{[item.variantSku && `SKU: ${item.variantSku}`, item.variantColor, item.variantSize].filter(Boolean).join(' · ')}</small></div><div className="receipt-item-price"><strong>{money(item.total)}</strong><small>{money(item.sellingPrice)} / unit</small></div></div>)}</section>
      <div className="receipt-totals"><dl><div><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>{Number(order.discount) > 0 && <div><dt>Discount</dt><dd>−{money(order.discount)}</dd></div>}{Number(order.offerDiscount) > 0 && <div><dt>Offer discount</dt><dd>−{money(order.offerDiscount)}</dd></div>}<div><dt>Tax</dt><dd>{money(order.tax)}</dd></div><div><dt>Round off</dt><dd>{money(order.roundOff)}</dd></div></dl><div className="receipt-grand-total"><h3>Total amount</h3><strong>{money(order.totalAmount)}</strong></div></div>
      {order.notes && <p className="receipt-notes">{order.notes}</p>}
      <footer className="receipt-footer"><p>{order.cashierName ? <>Cashier: <strong>{order.cashierName}</strong></> : business.name}</p><div><button onClick={print}>↥ Print / Save PDF</button><button className="receipt-done" onClick={onClose}>Done</button></div></footer>
    </div>
  </dialog>, document.body)
}
