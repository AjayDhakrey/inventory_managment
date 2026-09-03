import { useCallback, useState } from "react";
import { productApi } from "../api/productApi.js";
import { useResource } from "../hooks/useResource.js";
import AsyncBoundary from "./AsyncBoundary.jsx";

function Products({ business, account }) {
  const loadProducts = useCallback(() => productApi.list(), []);
  const {
    data: products,
    loading,
    error,
    refetch,
    setData,
  } = useResource(loadProducts, [], []);
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
      .includes(search.toLowerCase()),
  );

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
    <section className="products-page">
      <div className="products-toolbar">
        <div>
          <p className="dashboard-kicker">Inventory / Products</p>
          <h2>Products</h2>
          <p className="products-count">
            {products.length} products in {business.name}
          </p>
        </div>
        {canCreate && <button
          className="submit-button product-add-button"
          type="button"
          onClick={() => openForm()}
        >
          Add product <span>+</span>
        </button>}
      </div>
      <div className="products-controls">
        <div className="search-box">
          <span>⌕</span>
          <input
            aria-label="Search products"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, SKU, or category"
          />
        </div>
        <span className="business-filter">{business.industry} business</span>
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
            <span>Product</span>
            <span>Category</span>
            <span>Stock</span>
            <span>Price</span>
            <span>Actions</span>
          </div>
          {visibleProducts.map((product) => (
            <div className="product-table-row" key={product.productId}>
              <span className="product-cell">
                <span className="product-thumb">{product.name[0]}</span>
                <span>
                  <strong>{product.name}</strong>
                  <small>
                    {product.sku} · {product.unit}
                  </small>
                </span>
              </span>
              <span>{product.category}</span>
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
      </AsyncBoundary>
    </section>
  );
}

export default Products;
