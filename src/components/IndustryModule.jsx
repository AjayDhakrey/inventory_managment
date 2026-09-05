import { useCallback, useMemo, useState } from 'react'
import { productApi } from '../api/productApi.js'
import { useResource } from '../hooks/useResource.js'
import AsyncBoundary from './AsyncBoundary.jsx'

const moduleField = {
  'Batch Management': 'batchNumber', 'Expiry Tracking': 'expiryDate', 'Size Management': 'size',
  'Color Management': 'color', 'Product Variants': 'size', 'Serial Numbers': 'serialNumber',
  'Warranty Tracking': 'warrantyMonths', 'Bulk Pricing': 'wholesalePrice',
}

function displayValue(product, section) {
  if (section === 'Product Variants') return [product.size, product.color].filter(Boolean).join(' / ')
  const field = moduleField[section]
  if (!field) return product.category
  if (field === 'expiryDate') return product[field] ? new Date(product[field]).toLocaleDateString() : ''
  if (field === 'warrantyMonths') return product[field] ? `${product[field]} months` : ''
  return product[field]
}

export default function IndustryModule({ section, business }) {
  const [search, setSearch] = useState('')
  const isProductView = Boolean(moduleField[section])
  const load = useCallback(() => isProductView ? productApi.list() : Promise.resolve([]), [isProductView])
  const { data: products, loading, error, refetch } = useResource(load, [isProductView], [])
  const rows = useMemo(() => products.filter((product) => displayValue(product, section)), [products, section])
  const visibleRows = useMemo(() => {
    if (section !== 'Size Management' || !search.trim()) return rows
    const query = search.trim().toLowerCase()
    return rows.filter((product) =>
      `${product.name} ${product.sku} ${product.category} ${product.size} ${product.color || ''}`
        .toLowerCase()
        .includes(query),
    )
  }, [rows, search, section])
  return <section className="products-page">
    <div className="products-toolbar"><div><p className="dashboard-kicker">{business.industry} / {section}</p><h2>{section}</h2><p className="products-count">Configured for {business.name}</p></div><span className="business-filter">{business.businessType}</span></div>
    {section === 'Size Management' && <div className="products-controls"><div className="search-box"><span>⌕</span><input aria-label="Search size management" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, size, SKU, category, or color" /></div><span className="business-filter">{visibleRows.length} results</span></div>}
    {isProductView ? <AsyncBoundary loading={loading} error={error} onRetry={refetch} isEmpty={!visibleRows.length} emptyText={rows.length ? 'No sizes match your search.' : `No products with ${section.toLowerCase()} data yet. Add it from ${business.capabilities?.productLabel || 'Products'}.`}><div className="products-table"><div className="product-table-row product-table-head"><span>Product</span><span>Category</span><span>{section}</span><span>Stock</span><span>SKU</span></div>{visibleRows.map((product) => <div className="product-table-row" key={product.productId}><span className="product-cell"><span className="product-thumb">{product.name[0]}</span><strong>{product.name}</strong></span><span>{product.category}</span><span>{displayValue(product, section)}</span><span>{product.currentStock}</span><span>{product.sku}</span></div>)}</div></AsyncBoundary> : <div className="empty-dashboard"><span className="empty-dashboard-icon">◫</span><h2>{section}</h2><p>This workflow is enabled by the {business.industry} / {business.businessType} configuration and protected by your role permissions.</p></div>}
  </section>
}
