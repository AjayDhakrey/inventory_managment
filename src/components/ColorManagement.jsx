import { useCallback, useEffect, useState } from 'react'
import { colorApi } from '../api/colorApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'

export default function ColorManagement({ business, account }) {
  const [search, setSearch] = useState('')
  const loadColors = useCallback(() => colorApi.list({ search }), [search])
  const { data: colors, loading, error, refetch } = useResource(loadColors, [search], [])
  const [editing, setEditing] = useState(null)
  const [selectedColor, setSelectedColor] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const canManage = account.role === 'owner' || account.permissions?.includes('edit_product')

  useEffect(() => {
    if (!selectedColor) return undefined
    document.body.classList.add('color-modal-open')
    const close = (event) => { if (event.key === 'Escape') setSelectedColor(null) }
    window.addEventListener('keydown', close)
    return () => {
      document.body.classList.remove('color-modal-open')
      window.removeEventListener('keydown', close)
    }
  }, [selectedColor])

  const openForm = (color = null) => { setEditing(color); setFormOpen(true); setMessage(null) }
  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    const data = new FormData(event.currentTarget)
    const payload = { name: data.get('name').trim(), hexCode: data.get('hexCode').trim(), status: data.get('status') }
    setSaving(true); setMessage(null)
    try {
      if (editing) await colorApi.update(editing.colorId, payload)
      else await colorApi.create(payload)
      await refetch()
      setFormOpen(false); setEditing(null)
      setMessage({ type: 'success', text: editing ? 'Color updated.' : 'Color added.' })
    } catch (caught) { setMessage({ type: 'error', text: caught.message || 'Could not save the color.' }) }
    finally { setSaving(false) }
  }
  const toggle = async (color) => {
    setMessage(null)
    try {
      await colorApi.update(color.colorId, { status: color.status === 'active' ? 'inactive' : 'active' })
      await refetch()
    } catch (caught) { setMessage({ type: 'error', text: caught.message || 'Could not update the color.' }) }
  }

  return <section className="products-page color-management-page">
    <div className="products-toolbar"><div><p className="dashboard-kicker">Clothing / Color Management</p><h2>Color Management</h2><p className="products-count">Reusable colors and live color-wise stock for {business.name}</p></div>{canManage && <button className="submit-button product-add-button" type="button" onClick={() => openForm()}>Add color <span>+</span></button>}</div>
    <div className="products-controls"><div className="search-box"><span>⌕</span><input aria-label="Search colors and products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by color, product name or SKU..." /></div><span className="business-filter">{colors.length} colors</span></div>
    {formOpen && <form className="product-form color-form" onSubmit={submit}><div className="product-form-heading"><div><p className="dashboard-kicker">Color master</p><h3>{editing ? 'Edit color' : 'Add color'}</h3></div><button className="close-button" type="button" aria-label="Close form" onClick={() => setFormOpen(false)}>×</button></div><div className="product-form-grid"><div><label htmlFor="color-name">Color name *</label><input id="color-name" name="name" defaultValue={editing?.name || ''} placeholder="e.g. Navy Blue" required /></div><div><label htmlFor="color-code">Hex code</label><input id="color-code" name="hexCode" defaultValue={editing?.hexCode || ''} placeholder="#000080" pattern="^#?[0-9a-fA-F]{6}$" /></div><div><label htmlFor="color-status">Status</label><select id="color-status" name="status" defaultValue={editing?.status || 'active'}><option value="active">Active</option><option value="inactive">Inactive</option></select></div></div><div className="product-form-actions"><button className="outline-button" type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save color'} <span>→</span></button></div></form>}
    {message && <p className={`form-status ${message.type}`}>{message.text}</p>}
    <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!colors.length} emptyText={search ? 'No colors found.' : 'No colors found. Add your first reusable color.'}>
      <div className="color-list"><div className="color-row color-row-head"><span>Color</span><span>Status</span><span>Stock</span><span>Products</span><span>Actions</span></div>{colors.map((color) => <div className="color-row" key={color.colorId}><span className="color-name-cell"><i style={{ background: color.hexCode || '#d8ded9' }} aria-hidden="true" /><span><strong>{color.name}</strong><small>{color.hexCode || 'No hex code'}</small>{color.matchedProducts?.map((product) => <small className="color-match" key={product.productId}>Matched Product: {product.name} — {product.currentStock} units</small>)}</span></span><span><em className={`status-badge ${color.status}`}>{color.status}</em></span><span><strong>{Number(color.stockUnits).toLocaleString()} units</strong></span><span><button className="color-products-button" type="button" onClick={() => setSelectedColor(color)}>{color.productCount} {color.productCount === 1 ? 'Product' : 'Products'}</button></span><span className="product-actions">{canManage && <><button type="button" onClick={() => openForm(color)}>Edit</button><button type="button" onClick={() => toggle(color)}>{color.status === 'active' ? 'Disable' : 'Enable'}</button></>}</span></div>)}</div>
    </AsyncBoundary>
    {selectedColor && <div className="supplier-modal-backdrop color-products-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedColor(null)}><section className="supplier-modal color-products-modal" role="dialog" aria-modal="true" aria-labelledby="color-products-title"><div className="product-form-heading"><div><p className="dashboard-kicker">Color-wise inventory</p><h3 id="color-products-title">{selectedColor.name} Products</h3></div><button className="close-button" type="button" aria-label="Close product details" onClick={() => setSelectedColor(null)}>×</button></div>{selectedColor.products.length ? <div className="color-product-details">{selectedColor.products.map((product) => <article key={product.productId}><span className="product-thumb">{product.name[0]}</span><span><strong>{product.name}</strong><small>SKU: {product.sku}</small><small>Category: {product.category}{product.size ? ` · Size: ${product.size}` : ''}</small></span><b>{Number(product.currentStock).toLocaleString()} units</b></article>)}</div> : <p className="notif-empty">No products currently use this color.</p>}<footer className="color-products-total"><strong>{selectedColor.productCount} {selectedColor.productCount === 1 ? 'Product' : 'Products'}</strong><span>{Number(selectedColor.stockUnits).toLocaleString()} units total</span></footer></section></div>}
  </section>
}
