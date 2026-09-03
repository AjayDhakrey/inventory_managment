import { useCallback, useMemo, useRef, useState } from "react";
import { productImportApi } from "../api/productImportApi.js";
import { supplierApi } from "../api/supplierApi.js";
import { useResource } from "../hooks/useResource.js";

const COLUMNS = [
  ["name", "Product name"],
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
];
const NUMERIC = new Set([
  "quantity",
  "purchasePrice",
  "sellingPrice",
  "wholesalePrice",
  "gstRate",
]);

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
  if (Number(row.gstRate) > 100) errors.push("GST cannot exceed 100%.");
  return {
    ...row,
    errors,
    warnings: row.warnings || [],
    valid: errors.length === 0,
  };
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
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const inputRef = useRef(null);
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

  const choose = async (file) => {
    if (!file || working) return;
    setWorking(true);
    setMessage(null);
    setLastResult(null);
    try {
      setPreview(await productImportApi.extract(file));
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
      <div className="products-toolbar">
        <div>
          <p className="dashboard-kicker">Inventory / Bulk Import</p>
          <h2>Import products</h2>
          <p className="products-count">
            Validated PDF, CSV and Excel imports for {business.name}
          </p>
        </div>
        {preview && (
          <button
            className="outline-button"
            type="button"
            onClick={() => setPreview(null)}
          >
            Start over
          </button>
        )}
      </div>
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
                : "Drop your product file here"}
            </strong>
            <small>
              or click to choose PDF, CSV or XLSX · maximum 15 MB / 5,000 rows
            </small>
          </button>
          <input
            ref={inputRef}
            className="import-file-input"
            type="file"
            accept=".pdf,.csv,.xlsx"
            onChange={(event) => choose(event.target.files[0])}
          />
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
        <div className="section-heading">
          <div>
            <p className="dashboard-kicker">Audit log</p>
            <h2>Import history</h2>
          </div>
        </div>
        {!history.length ? (
          <p className="products-count">No completed imports yet.</p>
        ) : (
          <div className="import-history-list">
            {history.map((item) => (
              <article key={item.importId}>
                <span>
                  <strong>{item.fileName}</strong>
                  <small>
                    {new Date(item.createdAt).toLocaleString()} ·{" "}
                    {item.importedByName}
                  </small>
                </span>
                <span>
                  <strong>
                    {item.createdCount} created ·{" "}
                    {item.updatedCount + item.mergedCount} changed
                  </strong>
                  <small>
                    {item.failedCount} failed ·{" "}
                    {item.purchaseReference || "No purchase reference"}
                  </small>
                </span>
                <em className={item.status}>{item.status}</em>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
