import { useCallback, useState } from "react";
import { productApi } from "../api/productApi.js";
import { useResource } from "../hooks/useResource.js";
import AsyncBoundary from "./AsyncBoundary.jsx";
import "../styles/products-catalog.css";

function Products({ business, account }) {
  const loadProducts = useCallback(() => productApi.list(), []);
  const {
    data: products,
    loading,
    error,
    refetch,
    setData,
  } = useResource(loadProducts, [], []);
  const [category, setCategory] = useState("all"); const [stockFilter, setStockFilter] = useState("all"); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10); const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const canCreate = account.role === "owner" || account.permissions?.includes("create_product");
  const canEdit = account.role === "owner" || account.permissions?.includes("edit_product");
  const canDelete = account.role === "owner" || account.permissions?.includes("delete_product");
  const visibleProducts = products.filter((product) =>
    `${product.name} ${product.sku} ${product.category}`
      .toLowerCase()
      .includes(search.toLowerCase()) && (category === "all" || product.category === category) && (stockFilter === "all" || (stockFilter === "in" ? product.currentStock > 0 : product.currentStock <= product.minimumStock)),
  );

  const pages = Math.max(1, Math.ceil(visibleProducts.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pageProducts = visibleProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const money = (value) => `${business.currency === 'INR' ? '₹' : business.currency || ''}${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const toggleSelected = (id) => setSelected((list) => list.includes(id) ? list.filter((value) => value !== id) : [...list, id]);
  const exportSheet = (selectionOnly = false) => {
    const rows = selectionOnly ? visibleProducts.filter((product) => selected.includes(product.productId)) : visibleProducts;
    const cell = (value) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const values = [['Product', 'SKU', 'Category', 'Stock', 'Price', 'Currency'], ...rows.map((product) => [product.name, product.sku, product.category, product.currentStock, product.sellingPrice, business.currency])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + values.map((row) => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'products.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const payload = {
      name: data.get("name").trim(),
      sku: data.get("sku").trim().toUpperCase(),
      category: data.get("category").trim(),
      brand: data.get("brand").trim(),
      description: data.get("description").trim(),
      purchasePrice: Number(data.get("purchasePrice")) || 0,
      sellingPrice: Number(data.get("sellingPrice")),
      wholesalePrice: Number(data.get("wholesalePrice")) || 0,
      wholesaleMinQuantity: Number(data.get("wholesaleMinQuantity")) || 10,
      barcode: data.get("barcode").trim(),
      hsnCode: data.get("hsnCode").trim(),
      gstRate: Number(data.get("gstRate")) || 0,
      currentStock: Number(data.get("currentStock")) || 0,
      minimumStock: Number(data.get("minimumStock")) || 0,
      unit: data.get("unit"),
      supplier: data.get("supplier").trim(),
    };
    if (
      !payload.name ||
      !payload.sku ||
      !payload.category ||
      Number.isNaN(payload.sellingPrice)
    ) {
      setFormError(
        "Please complete the product name, SKU, category, and selling price.",
      );
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const saved = editingProduct
        ? await productApi.update(editingProduct.productId, payload)
        : await productApi.create(payload);
      setData((current) =>
        editingProduct
          ? current.map((item) =>
              item.productId === saved.productId ? saved : item,
            )
          : [saved, ...current],
      );
      setIsFormOpen(false);
      setEditingProduct(null);
    } catch (caught) {
      setFormError(caught.message || "Could not save the product.");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (productId) => {
    if (!window.confirm("Delete this product? This action cannot be undone.")) return;
    try {
      await productApi.remove(productId);
      setData((current) =>
        current.filter((product) => product.productId !== productId),
      );
    } catch (caught) {
      setFormError(caught.message || "Could not delete the product.");
    }
  };
  const openForm = (product = null) => {
    setEditingProduct(product);
    setFormError("");
    setIsFormOpen(true);
  };

  return (
    <section className="products-page products-catalog">
      <div className="products-toolbar">
        <div>
          <p className="dashboard-kicker">Inventory / Products</p>
          <h2>Products</h2>
          <p className="products-count">
            {products.length} products in {business.name}
          </p>
        </div>
        <div className="catalog-toolbar-actions"><button className="outline-button" type="button" disabled={loading || !!error || !visibleProducts.length} onClick={() => exportSheet()}>↥ Export sheet</button>{canCreate && <button
          className="submit-button product-add-button"
          type="button"
          onClick={() => openForm()}
        >
          Add product <span>+</span>
        </button>}</div>
      </div>
      {!loading && !error && <div className="catalog-stats">
        <article><span>Total Products</span><strong>{products.length.toLocaleString()}</strong><small>Registered inventory products</small><b aria-hidden="true">◇</b></article>
        <article><span>Low Stock Alert</span><strong>{products.filter((product) => product.currentStock <= product.minimumStock).length} SKUs</strong><small>At or below reorder level</small><b aria-hidden="true">⚠</b></article>
        <article><span>Total Stock Quantity</span><strong>{products.reduce((total, product) => total + Number(product.currentStock || 0), 0).toLocaleString()} <em>Units</em></strong><small>Across all registered products</small><b aria-hidden="true">#</b></article>
        <article><span>Inventory Valuation</span><strong>{money(products.reduce((total, product) => total + Number(product.currentStock || 0) * Number(product.purchasePrice || 0), 0))}</strong><small>At purchase cost ({business.currency})</small><b aria-hidden="true">＄</b></article>
      </div>}      <div className="products-controls">
        <div className="search-box">
          <span>⌕</span>
          <input
            aria-label="Search products"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search by name, SKU, or category"
          />
        </div>
        <span className="business-filter">{business.industry} business</span><select aria-label="Product category" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="all">All categories</option>{[...new Set(products.map((product) => product.category))].map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Stock filter" value={stockFilter} onChange={(event) => { setStockFilter(event.target.value); setPage(1); }}><option value="all">All stock</option><option value="in">In stock (&gt;0)</option><option value="low">Low / out of stock</option></select><button className="outline-button" type="button" disabled={!visibleProducts.some((product) => selected.includes(product.productId))} onClick={() => exportSheet(true)}>Export selected</button>
      </div>
      {isFormOpen && (
        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form-heading">
            <div>
              <p className="dashboard-kicker">
                {editingProduct ? "Update product" : "New product"}
              </p>
              <h3>{editingProduct ? "Edit product" : "Add a product"}</h3>
            </div>
            <button
              type="button"
              className="close-button"
              onClick={() => setIsFormOpen(false)}
              aria-label="Close form"
            >
              ×
            </button>
          </div>
          <div className="product-form-grid">
            <div className="field-wide">
              <label htmlFor="product-name">Product name *</label>
              <input
                id="product-name"
                name="name"
                defaultValue={editingProduct?.name || ""}
                placeholder="e.g. Premium Rice"
                required
              />
            </div>
            <div>
              <label htmlFor="product-sku">SKU / product code *</label>
              <input
                id="product-sku"
                name="sku"
                defaultValue={editingProduct?.sku || ""}
                placeholder="e.g. RIC-001"
                required
              />
            </div>
            <div>
              <label htmlFor="product-category">Category *</label>
              <input
                id="product-category"
                name="category"
                defaultValue={editingProduct?.category || ""}
                placeholder="e.g. Grocery"
                required
              />
            </div>
            <div>
              <label htmlFor="product-brand">Brand</label>
              <input
                id="product-brand"
                name="brand"
                defaultValue={editingProduct?.brand || ""}
                placeholder="Brand name"
              />
            </div>
            <div>
              <label htmlFor="product-unit">Unit</label>
              <select
                id="product-unit"
                name="unit"
                defaultValue={editingProduct?.unit || "piece"}
              >
                <option>piece</option>
                <option>kg</option>
                <option>gram</option>
                <option>litre</option>
                <option>box</option>
              </select>
            </div>
            <div>
              <label htmlFor="purchase-price">Purchase price</label>
              <input
                id="purchase-price"
                name="purchasePrice"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editingProduct?.purchasePrice || ""}
                placeholder="0.00"
              />
            </div>
            <div>
              <label htmlFor="selling-price">Retail price *</label>
              <input
                id="selling-price"
                name="sellingPrice"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editingProduct?.sellingPrice || ""}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label htmlFor="wholesale-price">Wholesale price</label>
              <input
                id="wholesale-price"
                name="wholesalePrice"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editingProduct?.wholesalePrice || ""}
                placeholder="0.00"
              />
            </div>
            <div>
              <label htmlFor="wholesale-min">Wholesale minimum qty</label>
              <input
                id="wholesale-min"
                name="wholesaleMinQuantity"
                type="number"
                min="1"
                defaultValue={editingProduct?.wholesaleMinQuantity || 10}
              />
            </div>
            <div>
              <label htmlFor="product-barcode">Barcode</label>
              <input
                id="product-barcode"
                name="barcode"
                defaultValue={editingProduct?.barcode || ""}
                placeholder="Scan or enter barcode"
              />
            </div>
            <div>
              <label htmlFor="product-hsn">HSN code</label>
              <input
                id="product-hsn"
                name="hsnCode"
                defaultValue={editingProduct?.hsnCode || ""}
                placeholder="e.g. 6205"
              />
            </div>
            <div>
              <label htmlFor="product-gst">GST rate %</label>
              <input
                id="product-gst"
                name="gstRate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                defaultValue={
                  editingProduct?.gstRate ??
                  business.settings?.defaultGstRate ??
                  0
                }
              />
            </div>
            <div>
              <label htmlFor="current-stock">Current stock</label>
              <input
                id="current-stock"
                name="currentStock"
                type="number"
                min="0"
                defaultValue={editingProduct?.currentStock ?? 0}
              />
            </div>
            <div>
              <label htmlFor="minimum-stock">Minimum stock level</label>
              <input
                id="minimum-stock"
                name="minimumStock"
                type="number"
                min="0"
                defaultValue={editingProduct?.minimumStock ?? 0}
              />
            </div>
            <div>
              <label htmlFor="supplier">Supplier</label>
              <input
                id="supplier"
                name="supplier"
                defaultValue={editingProduct?.supplier || ""}
                placeholder="Supplier name"
              />
            </div>
            <div className="field-wide">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                defaultValue={editingProduct?.description || ""}
                placeholder="Short product description"
              />
            </div>
          </div>
          {formError && <p className="setup-error">{formError}</p>}
          <div className="product-form-actions">
            <button
              type="button"
              className="outline-button"
              onClick={() => setIsFormOpen(false)}
            >
              Cancel
            </button>
            <button className="submit-button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save product"} <span>→</span>
            </button>
          </div>
        </form>
      )}
      {!isFormOpen && formError && (
        <p className="form-status error">{formError}</p>
      )}
      <AsyncBoundary
        loading={loading}
        error={error}
        onRetry={refetch}
        isEmpty={!visibleProducts.length}
        emptyText={
          products.length
            ? "No products match your search."
            : "No products yet. Add your first product."
        }
      >
        <div className="products-table">
          <div className="product-table-row product-table-head">
            <input className="catalog-check" type="checkbox" aria-label="Select all products on this page" checked={pageProducts.length > 0 && pageProducts.every((product) => selected.includes(product.productId))} onChange={(event) => setSelected((list) => event.target.checked ? [...new Set([...list, ...pageProducts.map((product) => product.productId)])] : list.filter((id) => !pageProducts.some((product) => product.productId === id)))} /><span>Product</span>
            <span>Category</span>
            <span>Stock</span>
            <span>Price</span>
            <span>Actions</span>
          </div>
          {pageProducts.map((product) => (
            <div className="product-table-row" key={product.productId}><input className="catalog-check" type="checkbox" aria-label={`Select ${product.name} ${product.sku}`} checked={selected.includes(product.productId)} onChange={() => toggleSelected(product.productId)} />
              <span className="product-cell">
                <span className="product-thumb">{product.name[0]}</span>
                <span>
                  <strong>{product.name}</strong>
                  <small>
                    {product.sku} · {product.unit}
                  </small>
                </span>
              </span>
              <span><span className="catalog-category">{product.category}</span></span>
              <span
                className={
                  product.currentStock <= product.minimumStock
                    ? "product-stock low"
                    : "product-stock"
                }
              >
                {product.currentStock}
                <small>
                  {product.currentStock === 0
                    ? "Out of stock"
                    : product.currentStock <= product.minimumStock
                      ? "Low stock"
                      : "In stock"}
                </small>
              </span>
              <span className="price-cell">
                {business.currency} {Number(product.sellingPrice).toFixed(2)}
              </span>
              <span className="product-actions">
                {canEdit && <button type="button" onClick={() => openForm(product)}>
                  Edit
                </button>}
                {canDelete && <button
                  type="button"
                  onClick={() => deleteProduct(product.productId)}
                >
                  Delete
                </button>}
              </span>
            </div>
          ))}
        </div>
<footer className="catalog-pagination"><span>Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, visibleProducts.length)} of {visibleProducts.length} products</span><label>Rows per page <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50].map((size) => <option key={size}>{size}</option>)}</select></label><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span aria-current="page">{currentPage}</span><span>of {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer>      </AsyncBoundary>
    </section>
  );
}

export default Products;


