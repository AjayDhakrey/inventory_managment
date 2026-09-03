import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { posApi } from "../api/posApi.js";
import { useResource } from "../hooks/useResource.js";
import AsyncBoundary from "./AsyncBoundary.jsx";

const METHODS = [
  "Cash",
  "UPI",
  "QR",
  "Debit Card",
  "Credit Card",
  "Bank transfer",
  "Pay Later",
];
const money = (currency, value) =>
  `${currency} ${Number(value || 0).toFixed(2)}`;

function Invoice({ invoice, onClose }) {
  const download = () => {
    const content = document.querySelector(".invoice-sheet")?.outerHTML || "";
    const blob = new Blob(
      [
        `<!doctype html><meta charset="utf-8"><title>${invoice.invoiceNumber}</title><style>body{font:14px Arial;padding:30px;color:#25312c}.invoice-sheet{max-width:820px;margin:auto}.invoice-brand,.invoice-meta,.invoice-total-row{display:flex;justify-content:space-between}.invoice-table{width:100%;border-collapse:collapse;margin:22px 0}.invoice-table th,.invoice-table td{padding:9px;border-bottom:1px solid #ddd;text-align:left}.invoice-totals{margin-left:auto;max-width:330px}.invoice-total-row{padding:5px 0}.grand{font-size:18px;font-weight:bold;border-top:2px solid #222;margin-top:7px;padding-top:10px}</style>${content}`,
      ],
      { type: "text/html" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${invoice.invoiceNumber}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const print = () => {
    document.body.classList.add("pos-printing");
    window.print();
    setTimeout(() => document.body.classList.remove("pos-printing"), 500);
  };
  return (
    <div
      className="invoice-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Invoice ${invoice.invoiceNumber}`}
    >
      <div className="invoice-actions">
        <button type="button" onClick={print}>
          Print bill
        </button>
        <button type="button" onClick={download}>
          Download
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <article className="invoice-sheet">
        <div className="invoice-brand">
          <div>
            <h2>{invoice.business.name}</h2>
            <p>
              {invoice.business.address}
              <br />
              {invoice.business.city}, {invoice.business.state}
              <br />
              GSTIN: {invoice.business.gstin || "Not provided"}
            </p>
          </div>
          <div>
            <strong>TAX INVOICE</strong>
            <p>
              {invoice.invoiceNumber}
              <br />
              {new Date(invoice.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="invoice-meta">
          <p>
            <strong>Bill to</strong>
            <br />
            {invoice.customerName}
            <br />
            {invoice.customerSnapshot?.phone}
            <br />
            GSTIN: {invoice.customerSnapshot?.gstin || "N/A"}
          </p>
          <p>
            <strong>Billing</strong>
            <br />
            {invoice.billingType}
            <br />
            Cashier: {invoice.cashierName}
            <br />
            Status: {invoice.paymentStatus}
          </p>
        </div>
        <table className="invoice-table">
          <thead>
            <tr>
              <th>Item / HSN</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Discount</th>
              <th>GST</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={String(item.productId)}>
                <td>
                  {item.productName}
                  <small>{item.hsnCode ? ` / ${item.hsnCode}` : ""}</small>
                </td>
                <td>{item.quantity}</td>
                <td>{money(invoice.business.currency, item.sellingPrice)}</td>
                <td>{money(invoice.business.currency, item.discount)}</td>
                <td>{item.gstRate}%</td>
                <td>{money(invoice.business.currency, item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="invoice-totals">
          <div className="invoice-total-row">
            <span>Subtotal</span>
            <span>{money(invoice.business.currency, invoice.subtotal)}</span>
          </div>
          <div className="invoice-total-row">
            <span>Discounts</span>
            <span>
              -{" "}
              {money(
                invoice.business.currency,
                invoice.discount + invoice.offerDiscount,
              )}
            </span>
          </div>
          {invoice.cgst > 0 && (
            <>
              <div className="invoice-total-row">
                <span>CGST</span>
                <span>{money(invoice.business.currency, invoice.cgst)}</span>
              </div>
              <div className="invoice-total-row">
                <span>SGST</span>
                <span>{money(invoice.business.currency, invoice.sgst)}</span>
              </div>
            </>
          )}
          {invoice.igst > 0 && (
            <div className="invoice-total-row">
              <span>IGST</span>
              <span>{money(invoice.business.currency, invoice.igst)}</span>
            </div>
          )}
          <div className="invoice-total-row">
            <span>Round off</span>
            <span>{money(invoice.business.currency, invoice.roundOff)}</span>
          </div>
          <div className="invoice-total-row grand">
            <span>Total</span>
            <span>{money(invoice.business.currency, invoice.totalAmount)}</span>
          </div>
          <div className="invoice-total-row">
            <span>Paid</span>
            <span>{money(invoice.business.currency, invoice.amountPaid)}</span>
          </div>
          <div className="invoice-total-row due">
            <span>Balance due</span>
            <span>{money(invoice.business.currency, invoice.balanceDue)}</span>
          </div>
        </div>
        <div className="invoice-payments">
          <strong>Payments</strong>
          {invoice.paymentSummary.map((payment, index) => (
            <span key={`${payment.method}-${index}`}>
              {payment.method}:{" "}
              {money(invoice.business.currency, payment.amount)}{" "}
              {payment.reference && `(${payment.reference})`}
            </span>
          ))}
        </div>
        <footer>Thank you for your business.</footer>
      </article>
    </div>
  );
}

export default function POS({ business, account }) {
  const load = useCallback(
    () =>
      Promise.all([
        posApi.catalog(),
        posApi.customers(),
        posApi.invoices(),
      ]),
    [],
  );
  const { data, loading, error, refetch, setData } = useResource(
    load,
    [],
    [[], [], []],
  );
  const [products, customers, invoices] = data;
  const [search, setSearch] = useState("");
  const [billingType, setBillingType] = useState(
    business.businessType === "wholesale" ? "wholesale" : "retail",
  );
  const [customerMode, setCustomerMode] = useState("walkin");
  const [customerId, setCustomerId] = useState("");
  const [cart, setCart] = useState([]);
  const [discountType, setDiscountType] = useState("fixed");
  const [discountValue, setDiscountValue] = useState(0);
  const [offerCode, setOfferCode] = useState("");
  const [payments, setPayments] = useState([
    {
      method: business.settings?.defaultPaymentMethod || "Cash",
      amount: 0,
      reference: "",
    },
  ]);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    state: business.state || "",
    gstin: "",
  });
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [qr, setQr] = useState("");
  const searchRef = useRef(null);
  const canOverride =
    account.role === "owner" ||
    account.permissions?.includes("override_pos_price");

  const visible = useMemo(
    () =>
      products
        .filter((product) =>
          `${product.name} ${product.sku} ${product.barcode || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .slice(0, 24),
    [products, search],
  );
  const priceFor = (product, quantity) =>
    billingType === "wholesale" &&
    product.wholesalePrice > 0 &&
    quantity >= (product.wholesaleMinQuantity || 10)
      ? product.wholesalePrice
      : product.sellingPrice;
  const add = (product) =>
    setCart((current) => {
      const existing = current.find(
        (item) => item.productId === product.productId,
      );
      if (existing)
        return current.map((item) =>
          item.productId === product.productId
            ? {
                ...item,
                quantity: Math.min(product.currentStock, item.quantity + 1),
                unitPrice: priceFor(
                  product,
                  Math.min(product.currentStock, item.quantity + 1),
                ),
              }
            : item,
        );
      if (product.currentStock <= 0) return current;
      return [
        ...current,
        {
          productId: product.productId,
          name: product.name,
          sku: product.sku,
          stock: product.currentStock,
          quantity: 1,
          unitPrice: priceFor(product, 1),
          discount: 0,
          gstRate: product.gstRate || business.settings?.defaultGstRate || 0,
        },
      ];
    });
  const update = (id, field, value) =>
    setCart((current) =>
      current.map((item) => {
        if (item.productId !== id) return item;
        const next = { ...item, [field]: Number(value) };
        const product = products.find((row) => row.productId === id);
        if (field === "quantity") {
          next.quantity = Math.max(
            1,
            Math.min(product.currentStock, Math.floor(next.quantity || 1)),
          );
          if (!canOverride) next.unitPrice = priceFor(product, next.quantity);
        }
        return next;
      }),
    );
  const remove = (id) =>
    setCart((current) => current.filter((item) => item.productId !== id));
  const subtotal = cart.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const lineDiscount = cart.reduce(
    (sum, item) => sum + Number(item.discount || 0),
    0,
  );
  const beforeBillDiscount = Math.max(0, subtotal - lineDiscount);
  const globalDiscount = Math.min(
    beforeBillDiscount,
    discountType === "percent"
      ? (beforeBillDiscount * Math.min(100, discountValue)) / 100
      : discountValue,
  );
  const activePaymentOffers = (business.settings?.paymentOffers || []).filter(
    (offer) => offer.active !== false && offer.code,
  );
  const selectedOffer = activePaymentOffers.find(
    (offer) =>
      offer.active !== false &&
      offer.code === offerCode &&
      payments.some((payment) => payment.method === offer.paymentMethod) &&
      beforeBillDiscount >= Number(offer.minimumAmount || 0),
  );
  let offerDiscount = selectedOffer
    ? selectedOffer.discountType === "fixed"
      ? Number(selectedOffer.value)
      : (beforeBillDiscount * Number(selectedOffer.value || 0)) / 100
    : 0;
  if (selectedOffer?.maximumDiscount > 0)
    offerDiscount = Math.min(offerDiscount, selectedOffer.maximumDiscount);
  offerDiscount = Math.min(
    Math.max(0, beforeBillDiscount - globalDiscount),
    offerDiscount,
  );
  const taxable = Math.max(
    0,
    beforeBillDiscount - globalDiscount - offerDiscount,
  );
  const estimatedTax =
    beforeBillDiscount > 0
      ? cart.reduce(
          (sum, item) =>
            sum +
            (taxable *
              (Math.max(0, item.quantity * item.unitPrice - item.discount) /
                beforeBillDiscount) *
              item.gstRate) /
              100,
          0,
        )
      : 0;
  const estimatedTotal = Math.round(taxable + estimatedTax);
  const paid = payments
    .filter((payment) => !["Credit", "Pay Later"].includes(payment.method))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const qrPaymentSelected = payments.some((payment) =>
    ["UPI", "QR"].includes(payment.method),
  );
  const qrAmount =
    payments
      .filter((payment) => ["UPI", "QR"].includes(payment.method))
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0) ||
    Math.max(0, estimatedTotal - paid);

  useEffect(() => {
    const upiId = business.settings?.upiId;
    let active = true;
    const renderQr = async () => {
      if (!qrPaymentSelected || !upiId || estimatedTotal <= 0 || qrAmount <= 0) {
        if (active) setQr("");
        return;
      }
      try {
        const image = await QRCode.toDataURL(
          `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(business.name)}&am=${qrAmount.toFixed(2)}&cu=INR`,
          { width: 180, margin: 1 },
        );
        if (active) setQr(image);
      } catch {
        if (active) setQr("");
      }
    };
    renderQr();
    return () => {
      active = false;
    };
  }, [business, estimatedTotal, qrAmount, qrPaymentSelected]);

  const scan = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const exact =
      products.find((product) =>
        [product.barcode, product.sku]
          .filter(Boolean)
          .some((value) => value.toLowerCase() === search.trim().toLowerCase()),
      ) || visible[0];
    if (exact) {
      add(exact);
      setSearch("");
    }
  };
  const setPayment = (index, field, value) =>
    setPayments((current) =>
      current.map((payment, i) =>
        i === index
          ? { ...payment, [field]: field === "amount" ? Number(value) : value }
          : payment,
      ),
    );
  const checkout = async () => {
    if (!cart.length || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await posApi.checkout({
        billingType,
        customerId: customerMode === "existing" ? customerId : "",
        newCustomer: customerMode === "new" ? newCustomer : null,
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
        })),
        discount: { type: discountType, value: Number(discountValue) || 0 },
        offerCode,
        payments,
        notes: "",
      });
      setInvoice(result.invoice);
      setCart([]);
      setDiscountValue(0);
      setPayments([
        {
          method: business.settings?.defaultPaymentMethod || "Cash",
          amount: 0,
          reference: "",
        },
      ]);
      setMessage({
        type: "success",
        text: `${result.invoice.invoiceNumber} completed successfully.`,
      });
      const fresh = await Promise.all([
        posApi.catalog(),
        posApi.customers(),
        posApi.invoices(),
      ]);
      setData(fresh);
    } catch (caught) {
      setMessage({ type: "error", text: caught.message || "Checkout failed." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="pos-page">
      <div className="products-toolbar">
        <div>
          <p className="dashboard-kicker">Orders / Sales / POS</p>
          <h2>Billing & Checkout</h2>
          <p className="products-count">
            Cashier: {account.name || account.email} · {business.name}
          </p>
        </div>
        <div className="pos-billing-switch">
          <button
            className={billingType === "retail" ? "active" : ""}
            type="button"
            onClick={() => setBillingType("retail")}
          >
            Retail
          </button>
          <button
            className={billingType === "wholesale" ? "active" : ""}
            type="button"
            onClick={() => setBillingType("wholesale")}
          >
            Wholesale
          </button>
        </div>
      </div>
      {message && (
        <p className={`form-status ${message.type}`}>{message.text}</p>
      )}
      <div className="pos-layout">
        <section className="pos-catalog">
          <div className="pos-search">
            <span>⌕</span>
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={scan}
              placeholder="Scan barcode or search name / SKU, then press Enter"
              autoFocus
            />
            <small>Scanner ready</small>
          </div>
          <AsyncBoundary
            loading={loading}
            error={error}
            onRetry={refetch}
            isEmpty={!visible.length}
            emptyText="No matching products."
          >
            <div className="pos-product-grid">
              {visible.map((product) => (
                <button
                  type="button"
                  className="pos-product"
                  key={product.productId}
                  onClick={() => add(product)}
                  disabled={product.currentStock <= 0}
                >
                  <span className="product-thumb">{product.name[0]}</span>
                  <strong>{product.name}</strong>
                  <small>
                    {product.sku}
                    {product.barcode ? ` · ${product.barcode}` : ""}
                  </small>
                  <span>
                    {money(
                      business.currency,
                      billingType === "wholesale" && product.wholesalePrice
                        ? product.wholesalePrice
                        : product.sellingPrice,
                    )}
                  </span>
                  <em
                    className={
                      product.currentStock <= product.minimumStock ? "low" : ""
                    }
                  >
                    {product.currentStock} in stock
                  </em>
                </button>
              ))}
            </div>
          </AsyncBoundary>
          <div className="pos-history">
            <div className="section-heading">
              <div>
                <p className="dashboard-kicker">Saved bills</p>
                <h2>Recent invoices</h2>
              </div>
            </div>
            {invoices.slice(0, 8).map((row) => (
              <button
                type="button"
                key={row.orderId}
                onClick={async () =>
                  setInvoice(await posApi.invoice(row.orderId))
                }
              >
                <span>
                  <strong>{row.invoiceNumber}</strong>
                  <small>
                    {row.customerName} ·{" "}
                    {new Date(row.createdAt).toLocaleString()}
                  </small>
                </span>
                <span>
                  {money(business.currency, row.totalAmount)}
                  <small>{row.paymentStatus}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
        <aside className="pos-checkout">
          <div className="pos-customer">
            <label>Customer</label>
            <div className="customer-mode">
              <button
                className={customerMode === "walkin" ? "active" : ""}
                type="button"
                onClick={() => setCustomerMode("walkin")}
              >
                Walk-in
              </button>
              <button
                className={customerMode === "existing" ? "active" : ""}
                type="button"
                onClick={() => setCustomerMode("existing")}
              >
                Existing
              </button>
              <button
                className={customerMode === "new" ? "active" : ""}
                type="button"
                onClick={() => setCustomerMode("new")}
              >
                New
              </button>
            </div>
            {customerMode === "existing" && (
              <select
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option value={customer.customerId} key={customer.customerId}>
                    {customer.name} ·{" "}
                    {customer.gstin || customer.phone || "Retail"}
                  </option>
                ))}
              </select>
            )}
            {customerMode === "new" && (
              <div className="new-customer-grid">
                {["name", "phone", "email", "state", "gstin"].map((field) => (
                  <input
                    key={field}
                    placeholder={field.toUpperCase()}
                    value={newCustomer[field]}
                    onChange={(event) =>
                      setNewCustomer({
                        ...newCustomer,
                        [field]: event.target.value,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>
          <div className="pos-cart-head">
            <strong>Cart</strong>
            <span>
              {cart.reduce((sum, item) => sum + item.quantity, 0)} items
            </span>
          </div>
          <div className="pos-cart">
            {!cart.length ? (
              <div className="pos-empty">
                Scan or select a product to begin billing.
              </div>
            ) : (
              cart.map((item) => (
                <div className="pos-cart-row" key={item.productId}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.sku} · GST {item.gstRate}%
                    </small>
                  </div>
                  <button type="button" onClick={() => remove(item.productId)}>
                    ×
                  </button>
                  <label>
                    Qty
                    <input
                      type="number"
                      min="1"
                      max={item.stock}
                      value={item.quantity}
                      onChange={(event) =>
                        update(item.productId, "quantity", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Price
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      disabled={!canOverride}
                      onChange={(event) =>
                        update(item.productId, "unitPrice", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Discount
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.discount}
                      onChange={(event) =>
                        update(item.productId, "discount", event.target.value)
                      }
                    />
                  </label>
                  <b>
                    {money(
                      business.currency,
                      item.quantity * item.unitPrice - item.discount,
                    )}
                  </b>
                </div>
              ))
            )}
          </div>
          <div className="pos-adjustments">
            <label>
              Bill discount
              <select
                value={discountType}
                onChange={(event) => setDiscountType(event.target.value)}
              >
                <option value="fixed">Fixed</option>
                <option value="percent">Percent</option>
              </select>
              <input
                type="number"
                min="0"
                value={discountValue}
                onChange={(event) =>
                  setDiscountValue(Number(event.target.value))
                }
              />
            </label>
            <label>
              Payment offer
              <select
                value={offerCode}
                onChange={(event) => setOfferCode(event.target.value)}
                disabled={!activePaymentOffers.length}
                title={activePaymentOffers.length ? "Select a payment offer" : "No payment offers are configured"}
              >
                <option value="">No offer</option>
                {activePaymentOffers.map((offer) => (
                    <option value={offer.code} key={offer.code}>
                      {offer.label || offer.code}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="pos-totals">
            <span>
              Subtotal <b>{money(business.currency, subtotal)}</b>
            </span>
            <span>
              Discount{" "}
              <b>
                -{" "}
                {money(
                  business.currency,
                  lineDiscount + globalDiscount + offerDiscount,
                )}
              </b>
            </span>
            <span>
              Estimated GST <b>{money(business.currency, estimatedTax)}</b>
            </span>
            <strong>
              Payable <b>{money(business.currency, estimatedTotal)}</b>
            </strong>
          </div>
          <div className="pos-payments">
            <div className="pos-cart-head">
              <strong>Payment</strong>
              <button
                type="button"
                onClick={() =>
                  setPayments([
                    ...payments,
                    { method: "UPI", amount: 0, reference: "" },
                  ])
                }
              >
                + Split
              </button>
            </div>
            {payments.map((payment, index) => (
              <div className="pos-payment-row" key={index}>
                <select
                  value={payment.method}
                  onChange={(event) =>
                    setPayment(index, "method", event.target.value)
                  }
                >
                  {METHODS.map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={payment.amount}
                  onChange={(event) =>
                    setPayment(index, "amount", event.target.value)
                  }
                  placeholder="Amount"
                />
                <input
                  value={payment.reference}
                  onChange={(event) =>
                    setPayment(index, "reference", event.target.value)
                  }
                  placeholder="Reference"
                />
                {payments.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setPayments(payments.filter((_, i) => i !== index))
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              className="pay-full"
              type="button"
              onClick={() => setPayment(0, "amount", estimatedTotal)}
            >
              Set full amount
            </button>
            {qrPaymentSelected && !business.settings?.upiId && (
              <p className="pos-qr-notice">
                Add your Business UPI ID in Business → Settings, save it, then
                return here to display the payment QR.
              </p>
            )}
            {qr && (
              <div className="pos-qr">
                <img
                  src={qr}
                  alt={`UPI payment QR for ${money(business.currency, qrAmount)}`}
                />
                <small>Scan to pay {money(business.currency, qrAmount)}</small>
                <small>{business.settings.upiId}</small>
              </div>
            )}
          </div>
          <button
            className="submit-button pos-checkout-button"
            type="button"
            disabled={!cart.length || saving}
            onClick={checkout}
          >
            {saving
              ? "Processing…"
              : `Complete sale · ${money(business.currency, estimatedTotal)}`}{" "}
            <span>→</span>
          </button>
        </aside>
      </div>
      {invoice && (
        <Invoice invoice={invoice} onClose={() => setInvoice(null)} />
      )}
    </section>
  );
}
