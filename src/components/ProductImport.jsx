import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { productImportApi } from "../api/productImportApi.js";
import { supplierApi } from "../api/supplierApi.js";
import { useResource } from "../hooks/useResource.js";

const COLUMNS = [
  ["name", "Product name"],
  ["parentSku", "Parent SKU"],
  ["sku", "SKU"],
  ["barcode", "Barcode"],
  ["category", "Category"],
  ["brand", "Brand"],
  ["size", "Size"],
  ["color", "Color"],
  ["quantity", "Qty"],
  ["purchasePrice", "Purchase"],
  ["sellingPrice", "Retail"],
  ["wholesalePrice", "Wholesale"],
  ["gstRate", "GST %"],
  ["hsnCode", "HSN"],
  ["supplierName", "Supplier"],
  ["minimumStock", "Min stock"],
  ["reorderPoint", "Reorder point"],
  ["targetStock", "Target stock"],
  ["reorderQuantity", "Reorder qty"],
];
const NUMERIC = new Set([
  "quantity",
  "purchasePrice",
  "sellingPrice",
  "wholesalePrice",
  "gstRate",
  "minimumStock",
  "reorderPoint",
  "targetStock",
  "reorderQuantity",
]);
const REQUIRED_COLUMNS = new Set(["name", "sku", "category"]);
const STATUS_LABEL = { completed: "Completed", partial: "Warnings", failed: "Failed" };
const FILE_ICON = { csv: "▤", xlsx: "▦", pdf: "▥" };

function validate(row) {
  const errors = [];
  if (!String(row.name || "").trim()) errors.push("Product name is required.");
  if (!String(row.sku || "").trim()) errors.push("SKU is required.");
  if (!String(row.category || "").trim()) errors.push("Category is required.");
  for (const field of NUMERIC)
    if (!Number.isFinite(Number(row[field])) || Number(row[field]) < 0)
      errors.push(`${field} must be zero or positive.`);
  if (!Number.isInteger(Number(row.quantity)))
    errors.push("Quantity must be a whole number.");
  if (Number(row.gstRate) > 100) errors.push(`GST must be between 0 and 100. Received ${row.gstRate}. Check the GST and HSN columns.`);
  return {
    ...row,
    errors,
    warnings: row.warnings || [],
    valid: errors.length === 0,
    invalidFields: Number(row.gstRate) > 100 ? ["gstRate"] : [],
  };
}

function downloadSampleTemplate() {
  const header = COLUMNS.map(([, label]) => label).join(",");
  const example = COLUMNS.map(([field]) => {
    if (field === "name") return "Sample Cotton T-Shirt";
    if (field === "sku") return "SKU-0001";
    if (field === "category") return "Apparel";
    if (field === "quantity") return "25";
    if (field === "sellingPrice") return "499";
    if (field === "purchasePrice") return "299";
    if (NUMERIC.has(field)) return "0";
    return "";
  }).join(",");
  const blob = new Blob([`${header}\n${example}\n`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "stockroom-import-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ProductImport({ business }) {
  const load = useCallback(
    () =>
      Promise.all([
        supplierApi.list({ status: "active" }),
        productImportApi.history(),
      ]),
    [],
  );
  const { data, refetch } = useResource(load, [], [[], []]);
  const [suppliers, history] = data;
  const [preview, setPreview] = useState(null);
  const [supplierId, setSupplierId] = useState("");
  const [purchaseReference, setPurchaseReference] = useState("");
  const [variantMode, setVariantMode] = useState(false);
  const [updateExistingPrices, setUpdateExistingPrices] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedLog, setExpandedLog] = useState(null);
  const inputRef = useRef(null);
  const isClothing = String(business.industry || "").toLowerCase() === "clothing";
  const summary = useMemo(
    () =>
      preview
        ? {
            total: preview.rows.length,
            valid: preview.rows.filter((row) => row.valid).length,
            invalid: preview.rows.filter((row) => !row.valid).length,
            duplicates: preview.rows.filter((row) => row.duplicate).length,
          }
        : null,
    [preview],
  );
  const hasInvalidRows = Boolean(preview?.rows.some((row) => !row.valid));
  useEffect(() => {
    if (!hasInvalidRows) return;
    requestAnimationFrame(() => document.querySelector('.import-table [data-invalid="true"]')?.focus({ preventScroll: true }));
  }, [preview?.fileName, hasInvalidRows]);
  const filteredHistory = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    return history.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (!term) return true;
      return item.fileName.toLowerCase().includes(term) || item.importId.toLowerCase().includes(term);
    });
  }, [history, historySearch, statusFilter]);

  const choose = async (file) => {
    if (!file || working) return;
    setWorking(true);
    setMessage(null);
    setLastResult(null);
    try {
      const extracted = await productImportApi.extract(file);
      setPreview(
        updateExistingPrices
          ? { ...extracted, rows: extracted.rows.map((row) => (row.duplicate ? { ...row, duplicateAction: "update" } : row)) }
          : extracted,
      );
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setWorking(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  const edit = (index, field, value) =>
    setPreview((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) =>
        rowIndex === index
          ? validate({
              ...row,
              [field]: NUMERIC.has(field) ? Number(value) : value,
            })
          : row,
      ),
    }));
  const setAllDuplicates = (duplicateAction) =>
    setPreview((current) => ({
      ...current,
      rows: current.rows.map((row) =>
        row.duplicate ? { ...row, duplicateAction } : row,
      ),
    }));
  const confirm = async () => {
    if (working || !preview) return;
    setWorking(true);
    setMessage(null);
    try {
      const result = await productImportApi.confirm({
        fileName: preview.fileName,
        fileType: preview.fileType,
        supplierId,
        purchaseReference,
        variantMode,
        rows: preview.rows,
      });
      setMessage({
        type: result.failures.length ? "error" : "success",
        text: `Import finished: ${result.counts.created} created, ${result.counts.updated} updated, ${result.counts.merged} merged, ${result.counts.skipped} skipped, ${result.failures.length} failed.`,
      });
      setLastResult(result);
      setPreview(null);
      await refetch();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="import-page">
      <div className="products-toolbar import-hero-top">
        <div>
          <p className="dashboard-kicker">Inventory / Bulk Import</p>
          <h2>Import products</h2>
          <p className="products-count">
            Validated PDF invoices, CSV sheets and Excel catalog sync for{" "}
            <b>{business.name}</b> {isClothing ? "clothing " : ""}workspace.
          </p>
        </div>
        <div className="import-hero-actions">
          {!preview && (
            <>
              <button className="outline-button" type="button" onClick={downloadSampleTemplate}>
                <span aria-hidden="true">⇩</span> Download sample (.csv)
              </button>
              <button className="outline-button" type="button" onClick={() => setShowGuidelines((current) => !current)} aria-expanded={showGuidelines}>
                <span aria-hidden="true">ⓘ</span> Import guidelines
              </button>
            </>
          )}
          {preview && (
            <button className="outline-button" type="button" onClick={() => setPreview(null)}>
              Start over
            </button>
          )}
        </div>
      </div>
      {showGuidelines && !preview && (
        <div className="import-guidelines-panel">
          <strong>Recognized columns</strong>
          <p>Column headers are matched automatically, in any order. Required columns are marked.</p>
          <ul>
            {COLUMNS.map(([field, label]) => (
              <li key={field}>
                {label}
                {REQUIRED_COLUMNS.has(field) && <em> · required</em>}
              </li>
            ))}
          </ul>
          <button className="outline-button" type="button" onClick={() => setShowGuidelines(false)}>Close</button>
        </div>
      )}
      {message && (
        <p className={`form-status ${message.type}`}>{message.text}</p>
      )}
      {lastResult?.failures?.length > 0 && (
        <section className="import-failures">
          <strong>Rows not imported</strong>
          {lastResult.failures.map((failure, index) => (
            <p key={`${failure.rowNumber}-${failure.sku}-${index}`}>
              <b>Row {failure.rowNumber}: {failure.sku || failure.name || "Unnamed product"}</b>
              <span>{failure.reasons.join(" ")}</span>
            </p>
          ))}
        </section>
      )}
      {!preview ? (
        <>
          <button
            className={`import-dropzone ${dragging ? "dragging" : ""}`}
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              choose(event.dataTransfer.files[0]);
            }}
            disabled={working}
          >
            <span className="import-icon">⇧</span>
            <strong>
              {working
                ? "Reading and validating file…"
                : "Drop your product catalog or invoice file here"}
            </strong>
            <small className="import-browse-hint">
              or <span className="import-browse-link">browse computer files</span> to upload
            </small>
            <div className="import-format-pills">
              <span className="import-pill import-pill-csv">
                <i aria-hidden="true">{FILE_ICON.csv}</i> .CSV Table
              </span>
              <span className="import-pill import-pill-xlsx">
                <i aria-hidden="true">{FILE_ICON.xlsx}</i> .XLSX Excel
              </span>
              <span className="import-pill import-pill-pdf">
                <i aria-hidden="true">{FILE_ICON.pdf}</i> .PDF Invoices (Auto OCR)
              </span>
            </div>
            <small className="import-limits">Maximum 15 MB · up to 5,000 rows</small>
          </button>
          <input
            ref={inputRef}
            className="import-file-input"
            type="file"
            accept=".pdf,.csv,.xlsx"
            onChange={(event) => choose(event.target.files[0])}
          />
          <div className="import-preflight">
            {isClothing && (
              <label className="import-checkbox">
                <input type="checkbox" checked={variantMode} onChange={(event) => setVariantMode(event.target.checked)} />
                Auto-detect variant groupings (Size &amp; Color)
              </label>
            )}
            <label className="import-checkbox">
              <input type="checkbox" checked={updateExistingPrices} onChange={(event) => setUpdateExistingPrices(event.target.checked)} />
              Update prices on existing matching SKUs
            </label>
          </div>
          <div className="import-guide">
            <article>
              <b>1</b>
              <strong>Recognizable headers</strong>
              <p>
                Use Product Name, SKU, Category, Quantity and Selling Price.
                Other columns map automatically.
              </p>
            </article>
            <article>
              <b>2</b>
              <strong>Review before saving</strong>
              <p>
                Nothing is added during extraction. Correct highlighted fields
                and resolve duplicates.
              </p>
            </article>
            <article>
              <b>3</b>
              <strong>Audited stock update</strong>
              <p>
                Confirmation creates products, stock movements and a
                business-scoped audit record.
              </p>
            </article>
          </div>
        </>
      ) : (
        <>
          <div className="import-summary">
            <span>
              <small>Rows</small>
              <strong>{summary.total}</strong>
            </span>
            <span className="success">
              <small>Valid</small>
              <strong>{summary.valid}</strong>
            </span>
            <span className={summary.invalid ? "danger" : ""}>
              <small>Invalid</small>
              <strong>{summary.invalid}</strong>
            </span>
            <span>
              <small>Duplicates</small>
              <strong>{summary.duplicates}</strong>
            </span>
            <span>
              <small>File</small>
              <strong>{preview.fileName}</strong>
            </span>
          </div>
          <div className="import-options">
            {isClothing && <label className="settings-toggle">
              <input type="checkbox" checked={variantMode} onChange={(event) => setVariantMode(event.target.checked)} />
              Import rows as Size × Color variants
              <small>Rows with the same Parent SKU—or the same product name/category—are grouped under one product.</small>
            </label>}
            <label>
              Supplier
              <select
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">Use supplier from each row</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.supplierId} value={supplier.supplierId}>
                    {supplier.supplierName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Purchase reference
              <input
                value={purchaseReference}
                onChange={(event) => setPurchaseReference(event.target.value)}
                placeholder="PO / invoice number"
              />
            </label>
            <div>
              <small>All duplicates</small>
              <button type="button" onClick={() => setAllDuplicates("skip")}>
                Skip
              </button>
              <button type="button" onClick={() => setAllDuplicates("update")}>
                Update
              </button>
              <button type="button" onClick={() => setAllDuplicates("merge")}>
                Merge stock
              </button>
            </div>
          </div>
          <div className="import-table-wrap">
            <table className="import-table">
              <thead>
                <tr>
                  <th>Status</th>
                  {COLUMNS.map(([, label]) => (
                    <th key={label}>{label}</th>
                  ))}
                  <th>Duplicate action</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr
                    key={`${row.rowNumber}-${index}`}
                    className={
                      !row.valid ? "invalid" : row.duplicate ? "duplicate" : ""
                    }
                  >
                    <td>
                      <span className="import-status">
                        {!row.valid
                          ? "Fix"
                          : row.duplicate
                            ? "Duplicate"
                            : row.warnings?.length
                              ? "Review"
                              : "Ready"}
                      </span>
                      {row.errors?.length > 0 && (
                        <small title={row.errors.join("\n")}>
                          {row.errors[0]}
                        </small>
                      )}
                      {row.errors?.length === 0 && row.warnings?.length > 0 && (
                        <small
                          className="import-warning"
                          title={row.warnings.join("\n")}
                        >
                          {row.warnings[0]}
                        </small>
                      )}
                    </td>
                    {COLUMNS.map(([field]) => (
                      <td key={field}>
                        <input
                          aria-label={`${field} row ${index + 1}`}
                          type={NUMERIC.has(field) ? "number" : "text"}
                          min={NUMERIC.has(field) ? 0 : undefined}
                          step={field === "quantity" ? 1 : "any"}
                          max={field === "gstRate" ? 100 : undefined}
                          data-invalid={row.invalidFields?.includes(field) ? "true" : undefined}
                          aria-invalid={row.invalidFields?.includes(field) || undefined}
                          value={row[field] ?? ""}
                          onChange={(event) =>
                            edit(index, field, event.target.value)
                          }
                        />
                      </td>
                    ))}
                    <td>
                      {row.duplicate ? (
                        <select
                          value={row.duplicateAction}
                          onChange={(event) =>
                            edit(index, "duplicateAction", event.target.value)
                          }
                        >
                            <option value="merge">Merge / add stock</option>
                            <option value="update">Update / replace stock</option>
                            <option value="skip">Skip</option>
                        </select>
                      ) : (
                        "New"
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="import-remove"
                        onClick={() =>
                          setPreview((current) => ({
                            ...current,
                            rows: current.rows.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="import-confirm">
            <p>
              <strong>{summary.valid} valid rows will be processed.</strong>
              <br />
              Invalid rows will be skipped and recorded with failure reasons.
            </p>
            <button
              className="submit-button"
              type="button"
              disabled={working || summary.valid === 0}
              onClick={confirm}
            >
              {working ? "Importing…" : "Confirm inventory import"}{" "}
              <span>→</span>
            </button>
          </div>
        </>
      )}
      <section className="import-history">
        <div className="section-heading import-history-head">
          <div>
            <p className="dashboard-kicker">Audit log</p>
            <h2>Import history</h2>
          </div>
          {history.length > 0 && (
            <div className="import-history-tools">
              <div className="search-box">
                <span aria-hidden="true">⌕</span>
                <input
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  placeholder="Filter batch or file name…"
                  aria-label="Filter import history"
                />
              </div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
                <option value="">All statuses</option>
                <option value="completed">Completed</option>
                <option value="partial">Warnings</option>
                <option value="failed">Failed</option>
              </select>
              <button type="button" className="outline-button import-refresh" onClick={refetch} aria-label="Refresh import history">
                ↻
              </button>
            </div>
          )}
        </div>
        {!history.length ? (
          <p className="products-count">No completed imports yet.</p>
        ) : !filteredHistory.length ? (
          <p className="products-count">No imports match this filter.</p>
        ) : (
          <div className="import-history-table-wrap">
            <table className="import-history-table">
              <thead>
                <tr>
                  <th>File &amp; batch ID</th>
                  <th>Timestamp</th>
                  <th>Operator</th>
                  <th>Records processed</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => (
                  <Fragment key={item.importId}>
                    <tr>
                      <td>
                        <span className="import-history-file">
                          <i className={`import-file-icon import-file-icon-${item.fileType}`} aria-hidden="true">
                            {FILE_ICON[item.fileType] || "▤"}
                          </i>
                          <span>
                            <strong>{item.fileName}</strong>
                            <small>BATCH-{item.importId.slice(-8).toUpperCase()}</small>
                          </span>
                        </span>
                      </td>
                      <td>{new Date(item.createdAt).toLocaleString()}</td>
                      <td>
                        <span className="import-operator">
                          <i aria-hidden="true" />
                          {item.importedByName}
                        </span>
                      </td>
                      <td>
                        <span className="import-records">
                          <b className="success">{item.createdCount} created</b>
                          <span>{item.updatedCount + item.mergedCount} changed</span>
                          <span className={item.failedCount ? "danger" : ""}>{item.failedCount} errors</span>
                        </span>
                      </td>
                      <td>
                        <em className={item.status}>{STATUS_LABEL[item.status] || item.status}</em>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="outline-button import-view-log"
                          disabled={!item.failures?.length}
                          onClick={() => setExpandedLog((current) => (current === item.importId ? null : item.importId))}
                        >
                          {item.failures?.length ? (expandedLog === item.importId ? "Hide log" : "View log") : "No issues"}
                        </button>
                      </td>
                    </tr>
                    {expandedLog === item.importId && item.failures?.length > 0 && (
                      <tr className="import-history-detail-row">
                        <td colSpan={6}>
                          {item.failures.map((failure, index) => (
                            <p key={`${item.importId}-${index}`}>
                              <b>Row {failure.rowNumber}: {failure.sku || failure.name || "Unnamed product"}</b>
                              <span>{failure.reasons.join(" ")}</span>
                            </p>
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
