const clean = (value) => String(value || '').trim()

function legacyParentSku(product) {
  if (!clean(product.size) || !clean(product.color) || product.variants?.length) return ''
  const parts = clean(product.sku).toUpperCase().split('-').filter(Boolean)
  return parts.length >= 3 ? parts.slice(0, -2).join('-') : ''
}

/** Builds selector entries without merging or mutating the underlying products. */
export function buildProductFamilies(products = []) {
  const uniqueProducts = [...new Map(products.filter((product) => product?.productId).map((product) => [product.productId, product])).values()]
  const families = new Map()
  for (const product of uniqueProducts) {
    const inferredParentSku = legacyParentSku(product)
    const identity = inferredParentSku
      ? `legacy:${clean(product.name).toLocaleLowerCase('en-US')}:${clean(product.category).toLocaleLowerCase('en-US')}:${clean(product.brand).toLocaleLowerCase('en-US')}:${inferredParentSku}`
      : `product:${product.productId}`
    const family = families.get(identity)
    if (family) family.productIds.push(product.productId)
    else families.set(identity, { identity, productId: product.productId, productIds: [product.productId], name: product.name, parentSku: inferredParentSku || product.sku, legacyFlatFamily: Boolean(inferredParentSku) })
  }
  return [...families.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.parentSku).localeCompare(String(b.parentSku)))
}
