  import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import "./App.css";
import "./styles/ui-system.css";
import "./styles/app-chrome.css";
import "./styles/overview-dashboard.css";
import BusinessSetup from "./components/BusinessSetup.jsx";
import Products from "./components/Products.jsx";
import InventoryOperations from "./components/InventoryOperations.jsx";
import UserManagement from "./components/UserManagement.jsx";
import Suppliers from "./components/Suppliers.jsx";
import Customers from "./components/Customers.jsx";
import PurchaseOrders from "./components/PurchaseOrders.jsx";
import Receiving from "./components/Receiving.jsx";
import SalesOrders from "./components/SalesOrders.jsx";
import Payments from "./components/Payments.jsx";
import POS from "./components/POS.jsx";
import PosDashboardStats from "./components/PosDashboardStats.jsx";
import ProductImport from "./components/ProductImport.jsx";
import IndustryModule from "./components/IndustryModule.jsx";
import BulkPricing from "./components/BulkPricing.jsx";
import ColorManagement from "./components/ColorManagement.jsx";
import ClothingModule from "./components/ClothingModule.jsx";
import {
  BusinessSettings,
  Settings,
  Reports,
  Returns,
} from "./components/RemainingModules.jsx";
import AsyncBoundary from "./components/AsyncBoundary.jsx";
import NotificationCenter from "./components/NotificationCenter.jsx";
import { getNavigation } from "./constants/navigation.js";
import { resolveBusinessCapabilities } from "../shared/industryConfig.js";
import { authApi } from "./api/authApi.js";
import { productApi } from "./api/productApi.js";
import { supplierApi } from "./api/supplierApi.js";
import { userApi } from "./api/userApi.js";
import { salesOrderApi } from "./api/salesOrderApi.js";
import { reportApi } from "./api/reportApi.js";
import { getCsrfToken } from "./api/client.js";
import { useResource } from "./hooks/useResource.js";

const LOW_STOCK_LIMIT = 10;
const NAVIGATION_LABELS = {
  Overview: "Dashboard Overview",
  Products: "Products Catalog",
  Stock: "Stock Ledger",
  "Stock In": "Stock Inward",
  "Stock Out": "Stock Outward",
  Adjustments: "Inventory Adjustments",
  "Stock History": "Stock Movement Audit",
  "POS / Billing": "POS Terminal",
  "Bulk Orders": "Wholesale Orders",
};

const navigationLabel = (item) => NAVIGATION_LABELS[item] || item;

// Visual stock-health ratio for the Overview inventory meter (0–100).
const stockLevelPct = (stock, minimum) => {
  const value = Number(stock || 0);
  if (value <= 0) return 0;
  const full = Math.max(Number(minimum || 0) * 3, 12);
  return Math.max(6, Math.min(100, Math.round((value / full) * 100)));
};

function Dashboard({ account, business, initialNav = "Overview", onLogout, onBusinessUpdate, theme, onToggleTheme }) {
  const [activeNav, setActiveNav] = useState(initialNav);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedNavSections, setExpandedNavSections] = useState(() => new Set(["Inventory"]));
  const [overviewMenu, setOverviewMenu] = useState(null);
  const [search, setSearch] = useState("");
  const [overviewCategory, setOverviewCategory] = useState("all");
  const [overviewSort, setOverviewSort] = useState("default");
  const [overviewPage, setOverviewPage] = useState(1);
  const [inventoryTableOpen, setInventoryTableOpen] = useState(true);
  const [expandedInventoryGroups, setExpandedInventoryGroups] = useState([]);
  const [stockAlertsOpen, setStockAlertsOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showWorkspacePopover, setShowWorkspacePopover] = useState(false);
  const [notif, setNotif] = useState({ items: [], unreadCount: 0 });
  const [dashboardNow] = useState(() => Date.now());
  const [gettingStarted, setGettingStarted] = useState(null);
  const [checklistDismissed, setChecklistDismissed] = useState(() => localStorage.getItem(`stockroom-getting-started:${business.businessId}`) === 'dismissed');
  const userMenuRef = useRef(null);
  const overviewMenuRef = useRef(null);
  const workspaceRef = useRef(null);

  const permissions = account.permissions || [];
  const canViewInventory = account.role === "owner" || permissions.includes('view_inventory');
  const can = (permission) => account.role === "owner" || permissions.includes(permission);
  const loadProducts = useCallback(() => canViewInventory ? productApi.list() : Promise.resolve([]), [canViewInventory]);
  const loadReport = useCallback(() => reportApi.summary().catch(() => null), []);
  const {
    data: products,
    loading,
    error,
    refetch,
  } = useResource(loadProducts, [], []);
  const { data: reportData, refetch: refetchReport } = useResource(loadReport, [], null);

  const notifItems = (notif?.items || [])
    .filter((item) =>
      ["inventory", "purchases", "payments"].includes(item.category),
    )
    .slice(0, 6);
  const capabilities = business.capabilities || resolveBusinessCapabilities(business);
  const visibleNavigation = getNavigation(business, can);
  const visiblePages = new Set(['Overview', ...visibleNavigation.flatMap(([, items]) => items)]);
  const canOpen = (item) => visiblePages.has(item === 'Products' ? capabilities.productLabel : item);
  const navigateTo = (navTo) => {
    const parentSection = visibleNavigation.find(([, items]) => items.includes(navTo))?.[0];
    if (parentSection) {
      setExpandedNavSections((current) => {
        if (current.has(parentSection)) return current;
        const next = new Set(current);
        next.add(parentSection);
        return next;
      });
    }
    setActiveNav(navTo);
    setMobileNavOpen(false);
    setShowUserMenu(false);
    setShowWorkspacePopover(false);
  };
  const openNotification = navigateTo;

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    document.body.classList.add("mobile-nav-visible");
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("mobile-nav-visible");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavOpen]);
  useEffect(() => {
    if (!showUserMenu) return undefined;
    const close = (event) => {
      if (event.type === "keydown" ? event.key === "Escape" : !userMenuRef.current?.contains(event.target)) setShowUserMenu(false);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("keydown", close); };
  }, [showUserMenu]);
  useEffect(() => {
    if (!showWorkspacePopover) return undefined;
    const close = (event) => {
      if (event.type === "keydown" ? event.key === "Escape" : !workspaceRef.current?.contains(event.target)) setShowWorkspacePopover(false);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("keydown", close); };
  }, [showWorkspacePopover]);
  useEffect(() => {
    if (!overviewMenu) return undefined;
    const close = (event) => {
      if (event.type === "keydown" ? event.key === "Escape" : !overviewMenuRef.current?.contains(event.target)) setOverviewMenu(null);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("keydown", close); };
  }, [overviewMenu]);
  useEffect(() => {
    if (!canViewInventory) return undefined;
    const refreshDashboardProducts = () => {
      refetch();
      if (typeof refetchReport === 'function') refetchReport();
    };
    window.addEventListener('stockroom:data-changed', refreshDashboardProducts);
    return () => window.removeEventListener('stockroom:data-changed', refreshDashboardProducts);
  }, [canViewInventory, refetch, refetchReport]);
  useEffect(() => {
    if (account.role !== 'owner' || checklistDismissed) return;
    Promise.all([supplierApi.list({ status: 'all' }), userApi.listMembers(), salesOrderApi.list()]).then(([suppliers, members, orders]) => setGettingStarted({ suppliers: suppliers.length, members: members.length, sales: orders.some((order) => order.status === 'Completed') })).catch(() => {});
  }, [account.role, checklistDismissed]);
  const overviewProducts = (products || []).map((product) => ({
    key: product.productId || product.sku,
    name: product.name,
    sku: product.sku,
    category: product.category,
    brand: product.brand || "",
    size: product.size || "",
    color: product.color || "",
    stock: Number(product.currentStock || 0),
    minimumStock: Number(product.minimumStock || LOW_STOCK_LIMIT),
    price: Number(product.sellingPrice || 0),
  }));
  const inventoryGroups = Array.from(
    overviewProducts.reduce((groups, item) => {
      const key = `${item.name.trim().toLowerCase()}::${item.category.trim().toLowerCase()}::${item.brand.trim().toLowerCase()}`;
      const group = groups.get(key) || { key, name: item.name, category: item.category, items: [] };
      group.items.push(item);
      groups.set(key, group);
      return groups;
    }, new Map()).values(),
  ).map((group) => {
    const prices = group.items.map((item) => item.price);
    const minimumPrice = Math.min(...prices);
    const maximumPrice = Math.max(...prices);
    return {
      ...group,
      stock: group.items.reduce((total, item) => total + item.stock, 0),
      price: minimumPrice === maximumPrice
        ? `${business.currency} ${minimumPrice.toFixed(2)}`
        : `${business.currency} ${minimumPrice.toFixed(2)}–${maximumPrice.toFixed(2)}`,
    };
  });
  const normalizedInventorySearch = search.trim().toLowerCase();
  const filteredInventoryGroups = inventoryGroups.filter((group) =>
    !normalizedInventorySearch || group.items.some((item) =>
      `${item.name} ${item.sku} ${item.category} ${item.brand} ${item.size} ${item.color}`
        .toLowerCase()
        .includes(normalizedInventorySearch),
    ),
  );
  const overviewRows = filteredInventoryGroups.filter((group) => overviewCategory === "all" || group.category === overviewCategory).sort((a, b) => overviewSort === "high" ? b.stock - a.stock : overviewSort === "low" ? a.stock - b.stock : 0);
  const overviewPages = Math.max(1, Math.ceil(overviewRows.length / 8));
  const currentOverviewPage = Math.min(overviewPage, overviewPages);
  const toggleInventoryGroup = (groupKey) => {
    setExpandedInventoryGroups((current) =>
      current.includes(groupKey)
        ? current.filter((key) => key !== groupKey)
        : [...current, groupKey],
    );
  };
  const inventoryValue = (products || []).reduce((total, product) => total + Number(product.currentStock || 0) * Number(product.purchasePrice || 0), 0);
  const unitsInStock = (products || []).reduce((total, product) => total + Number(product.currentStock || 0), 0);
  const lowStockCount = (products || []).filter((product) => Number(product.currentStock || 0) <= Number(product.minimumStock ?? LOW_STOCK_LIMIT)).length;
  const clothingVariants = (products || []).flatMap((product) => product.variants || []);
  const lowStockVariantCount = clothingVariants.filter((variant) => variant.active !== false && Number(variant.currentStock || 0) <= Number(variant.reorderPoint || variant.minimumStock || 0)).length;
  const reorderSuggestionCount = clothingVariants.filter((variant) => variant.active !== false && variant.replenishmentEnabled && Number(variant.currentStock || 0) <= Number(variant.reorderPoint || 0)).length;
  const now = dashboardNow;
  const expiringCount = (products || []).filter((product) => product.expiryDate && new Date(product.expiryDate).getTime() >= now && new Date(product.expiryDate).getTime() <= now + 30 * 86400000).length;
  const expiredCount = (products || []).filter((product) => product.expiryDate && new Date(product.expiryDate).getTime() < now).length;
  const hasWidget = (widget) => capabilities.dashboardWidgets.includes(widget);
  const topValue = (field) => {
    const counts = new Map();
    for (const product of products || []) if (product[field]) counts.set(product[field], (counts.get(product[field]) || 0) + Number(product.currentStock || 0));
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || 'No data';
  };
  const overviewNavigation = {
    Inventory: [["Catalog", [capabilities.productLabel, "Categories", "Bulk Import"]], ["Stock control", ["Stock In", "Stock Out", "Adjustments", "Stock History"]]],
    Purchasing: [["Supply", ["Suppliers", "Purchase Orders", "Receiving"]]],
    Sales: [["Sell", ["POS / Billing", "Orders", "Customers"]], ["After sales", ["Returns", "Payments"]]],
    Business: [["Workspace", ["Business Profile", "Settings"]], ["Team & insights", ["Users", "Roles", "Permissions", "Reports"]]],
  };

  return (
    <main className={`dashboard-shell ${activeNav === "Overview" ? "overview-dashboard" : ""}${["Stock", "Stock In", "Stock Out", "Adjustments", "Stock History", "Categories", "Purchase Orders"].includes(activeNav) ? " stock-ledger-shell" : ""}${["Stock In", "Stock Out", "Adjustments"].includes(activeNav) ? " stock-in-shell" : ""}${activeNav === "Stock Out" ? " stock-out-shell" : ""}${activeNav === "Adjustments" ? " stock-adjustment-shell" : ""}${activeNav === "Stock History" ? " stock-audit-shell" : ""}${activeNav === "Categories" ? " category-shell" : ""}${activeNav === "Purchase Orders" ? " po-shell" : ""}${activeNav === "POS / Billing" ? " pos-shell" : ""}${activeNav === "Receiving" ? " stock-ledger-shell grn-shell" : ""}${activeNav === "Suppliers" ? " stock-ledger-shell sup-shell" : ""}${["Products", "Medicines"].includes(activeNav) ? " stock-ledger-shell products-shell" : ""}${activeNav === "Bulk Import" ? " stock-ledger-shell import-shell" : ""}${activeNav === "Orders" ? " stock-ledger-shell ord-shell" : ""}${activeNav === "Customers" ? " stock-ledger-shell cust-shell" : ""}${activeNav === "Payments" ? " stock-ledger-shell pay-shell" : ""}${activeNav === "Returns" ? " stock-ledger-shell ret-shell" : ""}${["Users", "Roles", "Permissions"].includes(activeNav) ? " stock-ledger-shell um-shell" : ""}${activeNav === "Reports" ? " stock-ledger-shell rep-shell" : ""}${["Business Profile", "Industry", "Settings"].includes(activeNav) ? " stock-ledger-shell biz-shell" : ""}${["Color Management", "Size Management", "Product Variants"].includes(activeNav) ? " stock-ledger-shell var-shell" : ""}${["Bulk Orders", "Credit Sales", "Bulk Pricing"].includes(activeNav) ? " stock-ledger-shell cs-shell" : ""}${["Variant Grid", "Replenishment", "Promotions", "Loyalty", "Coupons", "Gift Cards", "Cashier Shifts", "Clothing Reports"].includes(activeNav) ? " stock-ledger-shell cloth-shell" : ""} industry-${String(business?.industry || "general").toLowerCase().replace(/[^a-z0-9]+/g, "-")}${mobileNavOpen ? " nav-open" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="dashboard-sidebar" id="dashboard-navigation">
        <div className="dashboard-brand brand-mark">
          <span className="mark-icon" aria-hidden="true">
            <span />
          </span>
          <span>stockroom<b className="brand-badge">Pro</b></span>
          <span className="brand-version">v3.4.2 · Enterprise</span>
          <button
            className="mobile-nav-close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            ×
          </button>
        </div>
        <div
          className="workspace-switcher-wrap"
          ref={workspaceRef}
          onMouseEnter={() => setShowWorkspacePopover(true)}
          onMouseLeave={() => setShowWorkspacePopover(false)}
        >
          <button
            className={`workspace-switcher ${showWorkspacePopover ? "active" : ""}`}
            type="button"
            aria-expanded={showWorkspacePopover}
            aria-haspopup="dialog"
            aria-label="Workspace details"
            onClick={() => setShowWorkspacePopover(!showWorkspacePopover)}
          >
            <span className="workspace-avatar">
              {(business?.name || "Your business")[0].toUpperCase()}
            </span>
            <span className="workspace-copy">
              <small>Workspace</small>
              <strong>{business?.name || "Your business"}</strong>
            </span>
            <span className={`chevron workspace-chevron ${showWorkspacePopover ? "open" : ""}`} aria-hidden="true">
              <svg viewBox="0 0 20 20"><path d="m6 8 4 4 4-4" /></svg>
            </span>
          </button>

          {showWorkspacePopover && (
            <div className="workspace-popover" role="dialog" aria-label="Workspace Details">
              <div className="workspace-popover-header">
                <span className="workspace-popover-avatar">
                  {(business?.name || "Your business")[0].toUpperCase()}
                </span>
                <div className="workspace-popover-title">
                  <strong>{business?.name || "Your business"}</strong>
                  <span className="workspace-role-badge">
                    {account?.role === "owner" ? "Admin / Owner" : (account?.role ? account.role.charAt(0).toUpperCase() + account.role.slice(1) : "Team member")}
                  </span>
                </div>
              </div>

              <div className="workspace-popover-divider" />

              <div className="workspace-popover-details">
                <div className="workspace-detail-row">
                  <span className="workspace-detail-label">Industry</span>
                  <span className="workspace-detail-val">
                    {business?.industry
                      ? business.industry.charAt(0).toUpperCase() + business.industry.slice(1)
                      : "General"}
                  </span>
                </div>

                <div className="workspace-detail-row">
                  <span className="workspace-detail-label">Business Type</span>
                  <span className="workspace-detail-val">
                    {business?.businessType
                      ? business.businessType.charAt(0).toUpperCase() + business.businessType.slice(1)
                      : "Retail"}
                  </span>
                </div>
                

                <div className="workspace-detail-row">
                  <span className="workspace-detail-label">Access Level</span>
                  <span className="workspace-detail-val highlight">
                    {account?.role === "owner"
                      ? "Admin (Full Access)"
                      : account?.role === "admin"
                      ? "Administrator"
                      : "Team Member"}
                  </span>
                </div>

                {business?.currency && (
                  <div className="workspace-detail-row">
                    <span className="workspace-detail-label">Currency</span>
                    <span className="workspace-detail-val">{business.currency}</span>
                  </div>
                )}

                {(business?.city || business?.country) && (
                  <div className="workspace-detail-row">
                    <span className="workspace-detail-label">Location</span>
                    <span className="workspace-detail-val">
                      {[business.city, business.country].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
              </div>

              <div className="workspace-popover-actions">
                {canOpen("Business Profile") && (
                  <button
                    type="button"
                    className="workspace-popover-action"
                    onClick={() => {
                      navigateTo("Business Profile");
                      setShowWorkspacePopover(false);
                    }}
                  >
                    <span>⚙ Business Profile</span>
                    <span>→</span>
                  </button>
                )}
                {canOpen("Users") && (
                  <button
                    type="button"
                    className="workspace-popover-action"
                    onClick={() => {
                      navigateTo("Users");
                      setShowWorkspacePopover(false);
                    }}
                  >
                    <span>👥 Team & Users</span>
                    <span>→</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <nav className="module-nav" aria-label="Main navigation">
          <button
            className={activeNav === "Overview" ? "active" : ""}
            type="button"
            onClick={() => navigateTo("Overview")}
          >
            <span className="nav-symbol">▦</span>{navigationLabel("Overview")}
          </button>
          {visibleNavigation.map(([section, items], index) => (
            <div className="nav-group" key={section}>
              <button
                className={`nav-group-toggle${items.includes(activeNav) ? " contains-active" : ""}`}
                type="button"
                aria-expanded={items.length ? expandedNavSections.has(section) : undefined}
                aria-controls={items.length ? `nav-section-${section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined}
                onClick={() => {
                  if (!items.length) {
                    navigateTo(section);
                    return;
                  }
                  setExpandedNavSections((current) => {
                    const next = new Set(current);
                    if (next.has(section)) next.delete(section);
                    else next.add(section);
                    return next;
                  });
                }}
              >
                <span className="nav-symbol">
                  {["◫", "♧", "▣", "↗", "⌁", "◒", "⚙"][index]}
                </span>
                {navigationLabel(section)}
                <span className={`nav-chevron${expandedNavSections.has(section) ? " open" : ""}`}>{items.length ? "⌄" : ""}</span>
              </button>
              {items.length > 0 && expandedNavSections.has(section) && (
                <div className="nav-children" id={`nav-section-${section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                  {items.map((item) => (
                    <button
                      className={activeNav === item ? "active" : ""}
                      type="button"
                      key={item}
                      onClick={() => navigateTo(item)}
                    >
                      {navigationLabel(item)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-sync" aria-hidden="true">
            <span className="sidebar-sync-dot" />
            <span>Cloud sync active</span>
            <b>99.9%</b>
          </div>
          <button type="button" onClick={onLogout}>
            <span className="nav-symbol">↪</span>Log out
            <span className="sidebar-shift">Shift #{(String(account?.email || "user").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 90) + 1}</span>
          </button>
        </div>
      </aside>
      <button
        className="mobile-nav-backdrop"
        type="button"
        aria-label="Close navigation"
        tabIndex={mobileNavOpen ? 0 : -1}
        onClick={() => setMobileNavOpen(false)}
      />
      <section className="dashboard-main">
        {String(business?.industry || "").toLowerCase() === "clothing" && <div className="clothing-motion" aria-hidden="true"><span /><span /><span /><span /></div>}
        {sidebarCollapsed ? (
          <div className="desktop-collapsed-bar">
            <span className="brand-mark collapsed-brand"><span className="mark-icon" aria-hidden="true"><span /></span><span>stockroom</span></span>
            <button className="desktop-sidebar-toggle" type="button" aria-label="Open sidebar" aria-expanded="false" onClick={() => setSidebarCollapsed(false)}><span aria-hidden="true">☰</span></button>
          </div>
        ) : (
          <button className="desktop-sidebar-toggle" type="button" aria-label="Close sidebar" aria-expanded="true" onClick={() => setSidebarCollapsed(true)}><span aria-hidden="true">‹</span></button>
        )}
        <div className="mobile-dashboard-bar">
          <button
            className="mobile-menu-button"
            type="button"
            aria-label="Open navigation"
            aria-controls="dashboard-navigation"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <span className="mobile-page-title">{navigationLabel(activeNav)}</span>
        </div>
        <div className="business-context">
          <span className="business-context-dot" />{" "}
          {business?.name || "Your business"} <span>/</span>{" "}
          {business?.industry || "workspace"}
          {["Stock In", "Stock Out", "Adjustments"].includes(activeNav) && <><span>/</span><strong className="stock-in-breadcrumb">{activeNav}</strong><span className="stock-in-currency">{business.currency}</span></>}
          {activeNav === "Stock History" && <><span>/</span><strong className="audit-breadcrumb">Stock Movement Audit</strong><span className="audit-stream">Live stream</span><span className="audit-workspace-tag">{business.currency} · {(business.industry || "workspace").toUpperCase()}</span></>}
          {activeNav === "Categories" && <><span>/</span><strong className="cat-breadcrumb">Categories</strong><span className="cat-synced">Catalog synced</span><span className="cat-workspace-tag">{business.currency} · {(business.industry || "workspace").toUpperCase()}</span></>}
          {activeNav === "Overview" && <><span>/</span><strong className="ov-breadcrumb">{(business.industry || "Workspace").toUpperCase()} DASHBOARD</strong><span className="ov-node">Node active</span><span className="ov-workspace-tag">{business.currency} · {(business.city || "Main outlet").toUpperCase()}</span></>}
          {activeNav === "Purchase Orders" && <><span>/</span><strong className="po-breadcrumb">Purchase Orders</strong><span className="po-gateway">PO Gateway: Live</span><span className="po-workspace-tag">{business.currency} · {(business.industry || "workspace").toUpperCase()}</span></>}
          {activeNav === "POS / Billing" && <><span>/</span><strong className="pos-breadcrumb">POS Terminal</strong><span className="pos-gateway">POS Gateway: Live</span><span className="pos-workspace-tag">{business.currency} · {(business.industry || "workspace").toUpperCase()}</span></>}
          {activeNav === "Receiving" && <><span>/</span><strong className="grn-breadcrumb">Receiving &amp; GRN</strong><span className="grn-dock">Dock bay: Active</span><span className="grn-workspace-tag">{business.currency} · {(business.industry || "workspace").toUpperCase()}</span></>}
          {activeNav === "Suppliers" && <><span>/</span><strong className="sup-breadcrumb">Suppliers</strong><span className="sup-tag-live">Vendor ledger</span><span className="sup-workspace-tag">{business.currency} · {(business.industry || "workspace").toUpperCase()}</span></>}
          {["Products", "Medicines"].includes(activeNav) && <><span>/</span><strong className="pc-breadcrumb">{navigationLabel(activeNav)}</strong><span className="pc-tag-live">Catalog synced</span><span className="pc-workspace-tag">{business.currency} · {(business.industry || "workspace").toUpperCase()}</span></>}
          {activeNav === "Bulk Import" && <><span>/</span><strong className="pc-breadcrumb">Bulk Import</strong><span className="pc-tag-live">Ingestion pipeline</span><span className="pc-workspace-tag">{business.currency} · {(business.industry || "workspace").toUpperCase()}</span></>}
          {activeNav === "Orders" && <><span>/</span><strong className="ord-breadcrumb">Orders / Sales</strong><span className="ord-tag-live">Live pipeline</span><span className="ord-workspace-tag">{business.currency} · GST {(business.settings?.defaultGstRate ?? 0)}%</span></>}
          {activeNav === "Customers" && <><span>/</span><strong className="cust-breadcrumb">Customers</strong><span className="cust-tag-live">CRM ledger</span><span className="cust-workspace-tag">{business.currency} · {(business.industry || "workspace").toUpperCase()}</span></>}
          {activeNav === "Payments" && <><span>/</span><strong className="pay-breadcrumb">Payments &amp; Settlements</strong><span className="pay-tag-live">Counter online</span><span className="pay-workspace-tag">Base {business.currency}</span></>}
          {activeNav === "Returns" && <><span>/</span><strong className="ret-breadcrumb">Returns &amp; Refunds</strong><span className="ret-tag-live">Live terminal</span><span className="ret-workspace-tag">GST {(business.settings?.defaultGstRate ?? 0)}%</span></>}
          {["Users", "Roles", "Permissions"].includes(activeNav) && <><span>/</span><strong className="um-breadcrumb">{activeNav}</strong><span className="um-tag-live">Access control</span><span className="um-workspace-tag">{business.currency} · {(business.industry || "workspace").toUpperCase()}</span></>}
          {activeNav === "Reports" && <><span>/</span><strong className="rep-breadcrumb">Business Intelligence</strong><span className="rep-tag-live">Live data</span><span className="rep-workspace-tag">{business.currency} · {(business.industry || "workspace").toUpperCase()}</span></>}
          {["Business Profile", "Industry", "Settings"].includes(activeNav) && <><span>/</span><strong className="biz-breadcrumb">{activeNav === "Settings" ? "Settings" : "Business Profile"}</strong><span className="biz-tag-live">Workspace config</span><span className="biz-workspace-tag">{business.currency} · {(business.industry || "workspace").toUpperCase()}</span></>}
          {["Color Management", "Size Management", "Product Variants"].includes(activeNav) && <><span>/</span><strong className="var-breadcrumb">{activeNav}</strong><span className="var-tag-live">Catalog attributes</span><span className="var-workspace-tag">{(business.industry || "workspace").toUpperCase()}</span></>}
          {["Bulk Orders", "Credit Sales", "Bulk Pricing"].includes(activeNav) && <><span>/</span><strong className="cs-breadcrumb">{activeNav}</strong><span className="cs-tag-live">Wholesale</span><span className="cs-workspace-tag">{business.currency} · {(business.industry || "workspace").toUpperCase()}</span></>}
          {["Variant Grid", "Replenishment", "Promotions", "Loyalty", "Coupons", "Gift Cards", "Cashier Shifts", "Clothing Reports"].includes(activeNav) && <><span>/</span><strong className="cloth-breadcrumb">{activeNav}</strong><span className="cloth-tag-live">Clothing suite</span><span className="cloth-workspace-tag">{(business.industry || "workspace").toUpperCase()}</span></>}
        </div>
        <header className="dashboard-header">
          <div>
            <p className="dashboard-kicker">
              {activeNav === "Overview"
                ? `${new Intl.DateTimeFormat(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  }).format(new Date())} • Store shift #1 open`
                : `Manage your ${activeNav.toLowerCase()}`}
            </p>
            <h1>
              {activeNav === "Overview"
                ? `Welcome back, ${account.name || account.email.split("@")[0]}.`
                : activeNav}
            </h1>
          </div>
          <div className="header-actions">
            <button className="icon-button theme-toggle" type="button" onClick={onToggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} data-tooltip={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              <svg className="header-action-icon" viewBox="0 0 24 24" aria-hidden="true">
                {theme === "dark" ? <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></> : <path d="M20.5 14.1A8 8 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1Z" />}
              </svg>
            </button>
            <NotificationCenter
              onNavigate={openNotification}
              onOpen={() => setShowUserMenu(false)}
              onChange={setNotif}
            />
            <div
              className="header-popover-wrap user-menu-wrap"
              ref={userMenuRef}
              onMouseEnter={() => setShowUserMenu(true)}
              onMouseLeave={() => setShowUserMenu(false)}
            >
              <button
                className={`user-chip ${showUserMenu ? "active" : ""}`}
                type="button"
                aria-expanded={showUserMenu}
                aria-haspopup="dialog"
                aria-label="User account settings"
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <span className="user-avatar">
                  {(account.name || account.email)[0].toUpperCase()}
                </span>
                <span className="user-chip-copy">
                  <strong>{account.name || account.email.split("@")[0]}</strong>
                  <small>{account.role === "owner" ? "Administrator" : account.role || "Team member"}</small>
                </span>
                <span className={`chevron user-chevron ${showUserMenu ? "open" : ""}`} aria-hidden="true">
                  <svg viewBox="0 0 20 20"><path d="m6 8 4 4 4-4" /></svg>
                </span>
              </button>
              {showUserMenu && (
                <div className="header-popover user-popover" role="dialog" aria-label="User profile">
                  <div className="popover-user">
                    <span className="user-avatar popover-user-avatar">
                      {(account.name || account.email)[0].toUpperCase()}
                    </span>
                    <div className="popover-user-info">
                      <strong>{account.name || account.email.split("@")[0]}</strong>
                      <small>{account.email}</small>
                      <span className="user-role-badge">
                        {account.role === "owner" ? "Administrator / Owner" : account.role || "Team member"}
                      </span>
                    </div>
                  </div>

                  <div className="popover-divider" />

                  <div className="popover-detail">
                    <span className="detail-label">Workspace</span>
                    <strong className="detail-value">{business?.name || "Your business"}</strong>

                    <span className="detail-label">Industry</span>
                    <strong className="detail-value">
                      {business?.industry ? business.industry.charAt(0).toUpperCase() + business.industry.slice(1) : "General"}
                    </strong>

                    <span className="detail-label">Business Type</span>
                    <strong className="detail-value">
                      {business?.businessType ? business.businessType.charAt(0).toUpperCase() + business.businessType.slice(1) : "Retail"}
                    </strong>

                    <span className="detail-label">Access</span>
                    <strong className="detail-value highlight">
                      {account.role === "owner" ? "Admin (Full Access)" : account.role || "Team member"}
                    </strong>
                  </div>

                  <div className="popover-actions">
                    {canOpen("Business Profile") && (
                      <button
                        type="button"
                        className="popover-action-btn"
                        onClick={() => {
                          navigateTo("Business Profile");
                          setShowUserMenu(false);
                        }}
                      >
                        <svg className="profile-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V3h12v18M16 9h4v12M2 21h20M8 7h4M8 11h4M8 15h4M9 21v-2h2v2" /></svg>
                        <span>Business Profile</span>
                        <svg className="profile-menu-icon profile-menu-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
                      </button>
                    )}
                    {canOpen("Users") && (
                      <button
                        type="button"
                        className="popover-action-btn"
                        onClick={() => {
                          navigateTo("Users");
                          setShowUserMenu(false);
                        }}
                      >
                        <svg className="profile-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5.66" /></svg>
                        <span>Team & Users</span>
                        <svg className="profile-menu-icon profile-menu-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
                      </button>
                    )}
                  </div>

                  <button
                    className="popover-logout"
                    type="button"
                    onClick={onLogout}
                  >
                    <svg className="profile-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H4V3h5M10 12h11m-5-5 5 5-5 5" /></svg>
                    <span>Log out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {activeNav === "Overview" ? (
          <>
            <div
              className="overview-quick-nav"
              ref={overviewMenuRef}
              onMouseLeave={() => setOverviewMenu(null)}
            >
              <nav aria-label="Overview shortcuts">
                {Object.keys(overviewNavigation).map((group) => {
                  const available = overviewNavigation[group].some(([, items]) => items.some(canOpen));
                  if (!available) return null;
                  return (
                    <button
                      type="button"
                      key={group}
                      className={overviewMenu === group ? "active" : ""}
                      aria-expanded={overviewMenu === group}
                      onMouseEnter={() => setOverviewMenu(group)}
                      onClick={() => setOverviewMenu((current) => (current === group ? null : group))}
                    >
                      {group}
                    </button>
                  );
                })}
              </nav>
              <AnimatePresence>
                {overviewMenu && (
                  <motion.div
                    className="overview-mega-menu"
                    initial={{ opacity: 0, y: -6, scale: 0.99 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.99 }}
                    transition={{ duration: 0.15 }}
                  >
                    {overviewNavigation[overviewMenu].map(([heading, items]) => {
                      const visible = items.filter(canOpen);
                      return (
                        visible.length > 0 && (
                          <section key={heading}>
                            <p>{heading}</p>
                            {visible.map((item) => (
                              <button
                                type="button"
                                key={item}
                                onClick={() => {
                                  navigateTo(item);
                                  setOverviewMenu(null);
                                }}
                              >
                                {item}
                                <span aria-hidden="true">→</span>
                              </button>
                            ))}
                          </section>
                        )
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {account.role === 'owner' && !checklistDismissed && gettingStarted && <section className="getting-started"><header><div><p className="dashboard-kicker">Getting started</p><h2>Finish setting up at your pace</h2></div><button type="button" className="close-button" aria-label="Dismiss getting started" onClick={() => { localStorage.setItem(`stockroom-getting-started:${business.businessId}`, 'dismissed'); setChecklistDismissed(true); }}>×</button></header><div>{[[products.length > 0, 'Add first product', capabilities.productLabel], [gettingStarted.suppliers > 0, 'Add supplier', 'Suppliers'], [products.some((product) => Number(product.minimumStock) > 0 || product.variants?.some((variant) => variant.reorderPoint > 0)), 'Configure stock/reorder settings', capabilities.productLabel], [gettingStarted.sales, 'Make first sale', 'POS / Billing'], [gettingStarted.members > 1, 'Invite team member', 'Users']].map(([done, label, destination]) => <button type="button" key={label} onClick={() => navigateTo(destination)}><span className={done ? 'done' : ''}>{done ? '✓' : '○'}</span>{label}</button>)}</div></section>}
            {(hasWidget('todaySales') || hasWidget('sales')) && <PosDashboardStats
              business={business}
              onOpen={() => navigateTo("POS / Billing")}
            />}
            <div className="summary-row">
              {hasWidget('inventoryValue') && (
                <article className="summary-card dark-card" title="Total inventory valuation based on purchase prices">
                  <span className="summary-label">Inventory value</span>
                  <strong>{business.currency} {(reportData?.inventorySummary?.totalValuation ?? inventoryValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  <span className="trend neutral">Live cost valuation</span>
                </article>
              )}
              {hasWidget('todaySales') && (
                <article className="summary-card" title="Total sales revenue generated today">
                  <span className="summary-label">Today's Sales</span>
                  <strong>{business.currency} {Number(reportData?.salesSummary?.todaySales || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  <span className="trend positive">Today's billing</span>
                </article>
              )}
              {hasWidget('grossProfit') && (
                <article className="summary-card" title="Total profit margin (Revenue minus Cost of Goods Sold)">
                  <span className="summary-label">Gross Profit</span>
                  <strong>{business.currency} {Number(reportData?.salesSummary?.grossProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  <span className="trend positive">Revenue − COGS</span>
                </article>
              )}
              {hasWidget('receivables') && (
                <article className="summary-card" title="Total pending credit/receivable balances due from customers">
                  <span className="summary-label">Receivables</span>
                  <strong>{business.currency} {Number(reportData?.financialSummary?.outstandingReceivables || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  <span className="trend neutral">Customer credit due</span>
                </article>
              )}
              {(hasWidget('lowStock') || hasWidget('lowStockVariants')) && (
                <article className="summary-card" title="Products that have reached or fallen below minimum reorder levels">
                  <span className="summary-label">Needs restocking</span>
                  <strong>{reportData?.inventorySummary?.lowStockCount ?? (hasWidget('lowStockVariants') ? lowStockVariantCount : lowStockCount)}</strong>
                  <span className="trend negative">Low stock / Reorder alert</span>
                </article>
              )}
              {hasWidget('purchaseDue') && (
                <article className="summary-card" title="Pending payable balances due to suppliers for purchase orders">
                  <span className="summary-label">Purchase Due</span>
                  <strong>{business.currency} {Number(reportData?.financialSummary?.purchaseDue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  <span className="trend neutral">Supplier payables</span>
                </article>
              )}
              {hasWidget('pendingOrders') && (
                <article className="summary-card" title="Sales orders placed and awaiting fulfillment or payment">
                  <span className="summary-label">Pending Orders</span>
                  <strong>{reportData?.salesSummary?.pendingOrdersCount ?? 0}</strong>
                  <span className="trend neutral">{business.currency} {Number(reportData?.salesSummary?.pendingOrdersAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </article>
              )}
              {hasWidget('outOfStock') && (
                <article className="summary-card" title="Products with zero current stock in warehouse">
                  <span className="summary-label">Out of Stock</span>
                  <strong>{reportData?.inventorySummary?.outOfStockCount ?? (products || []).filter((p) => Number(p.currentStock || 0) <= 0).length}</strong>
                  <span className="trend negative">Zero stock items</span>
                </article>
              )}
              {hasWidget('itemsInStock') && (
                <article className="summary-card" title="Total units in stock across all products">
                  <span className="summary-label">Items in stock</span>
                  <strong>{unitsInStock.toLocaleString()}</strong>
                  <span className="trend neutral">Across {(products || []).length} products</span>
                </article>
              )}
              {hasWidget('activeSuppliers') && (
                <article className="summary-card" title="Suppliers currently active and verified for purchasing">
                  <span className="summary-label">Active Suppliers</span>
                  <strong>{reportData?.financialSummary?.activeSuppliers ?? 0}</strong>
                  <span className="trend neutral">Verified vendors</span>
                </article>
              )}
              {hasWidget('activeCustomers') && (
                <article className="summary-card" title="Registered retail, wholesale, dealer, and contractor accounts">
                  <span className="summary-label">Active Customers</span>
                  <strong>{reportData?.financialSummary?.activeCustomers ?? 0}</strong>
                  <span className="trend neutral">Customer accounts</span>
                </article>
              )}
              {hasWidget('totalVariants') && <article className="summary-card"><span className="summary-label">Active variants</span><strong>{clothingVariants.filter((variant) => variant.active !== false).length}</strong><span className="trend neutral">Size × color combinations</span></article>}
              {hasWidget('reorderSuggestions') && <article className="summary-card" title="Products flagged for reordering"><span className="summary-label">Reorder suggestions</span><strong>{reportData?.inventorySummary?.reorderRequired ?? reorderSuggestionCount}</strong><span className="trend neutral">Ready for review</span></article>}
              {hasWidget('expiringStock') && <article className="summary-card"><span className="summary-label">Expiring within 30 days</span><strong>{expiringCount}</strong><span className="trend neutral">Expiry tracking</span></article>}
              {hasWidget('expiredStock') && <article className="summary-card"><span className="summary-label">Expired stock</span><strong>{expiredCount}</strong><span className="trend neutral">Remove from sale</span></article>}
              {hasWidget('batchAlerts') && <article className="summary-card"><span className="summary-label">Tracked batches</span><strong>{(products || []).filter((product) => product.batchNumber).length}</strong><span className="trend neutral">Batch records</span></article>}
              {hasWidget('topSizes') && <article className="summary-card"><span className="summary-label">Top stocked size</span><strong>{topValue('size')}</strong><span className="trend neutral">Across clothing variants</span></article>}
              {hasWidget('warrantyAlerts') && <article className="summary-card"><span className="summary-label">Warranty-tracked items</span><strong>{(products || []).filter((product) => product.warrantyMonths).length}</strong><span className="trend neutral">Electronics records</span></article>}
            </div>
            <div className="dashboard-grid">
              <section className="inventory-section">
                <div className="section-heading">
                  <div>
                    <p className="dashboard-kicker">
                      Keep an eye on your stock
                    </p>
                    <h2>Inventory overview</h2>
                  </div>
                  <button
                    className="outline-button"
                    type="button"
                    onClick={() => navigateTo(capabilities.productLabel)}
                  >
                    View all <span>→</span>
                  </button>
                </div>
                <div className="table-tools">
                  <div className="search-box">
                    <span>⌕</span>
                    <input
                      aria-label="Search inventory"
                      value={search}
                      onChange={(event) => { setSearch(event.target.value); setOverviewPage(1); }}
                      placeholder="Search products or SKU"
                    />
                  </div><select className="overview-filter" aria-label="Inventory category" value={overviewCategory} onChange={(event) => { setOverviewCategory(event.target.value); setOverviewPage(1); }}><option value="all">All categories</option>{[...new Set(inventoryGroups.map((group) => group.category))].map((category) => <option key={category}>{category}</option>)}</select><select className="overview-filter" aria-label="Sort inventory stock" value={overviewSort} onChange={(event) => { setOverviewSort(event.target.value); setOverviewPage(1); }}><option value="default">Default order</option><option value="high">Stock: High to low</option><option value="low">Stock: Low to high</option></select>
                </div>
                <AsyncBoundary
                  loading={loading}
                  error={error}
                  onRetry={refetch}
                  isEmpty={!overviewRows.length}
                  emptyText={
                    overviewProducts.length
                      ? "No products match your search."
                      : "No products yet. Add your first product from the Products screen."
                  }
                >
                  <div className="inventory-table">
                    <button
                      className="table-row table-head inventory-table-toggle"
                      type="button"
                      aria-expanded={inventoryTableOpen}
                      aria-label={`${inventoryTableOpen ? "Collapse" : "Expand"} inventory overview`}
                      onClick={() => setInventoryTableOpen((current) => !current)}
                    >
                      <span>Product</span>
                      <span>Category</span>
                      <span>Stock</span>
                      <span className="inventory-table-price-heading">
                        Price
                        <span className="inventory-table-chevron" aria-hidden="true">⌄</span>
                      </span>
                    </button>
                    {inventoryTableOpen && overviewRows.slice((currentOverviewPage - 1) * 8, currentOverviewPage * 8).map((group) => {
                      const isGroup = group.items.length > 1;
                      const expanded = expandedInventoryGroups.includes(group.key);
                      const firstItem = group.items[0];

                      if (!isGroup) {
                        return (
                          <div className="table-row" key={firstItem.key}>
                            <span className="product-cell">
                              <span className="product-thumb">{firstItem.name[0]}</span>
                              <span>
                                <strong>{firstItem.name}</strong>
                                <small>{firstItem.sku}</small>
                              </span>
                            </span>
                            <span className="category-cell">{firstItem.category}</span>
                            <span className={`stock-cell ${firstItem.stock === 0 ? "empty" : firstItem.stock <= firstItem.minimumStock ? "low" : ""}`}>
                              {firstItem.stock}
                              <small>{firstItem.stock === 0 ? "Out of stock" : firstItem.stock <= firstItem.minimumStock ? "Low stock" : "In stock"}</small>
                              <span className="stock-meter" aria-hidden="true"><i style={{ width: `${stockLevelPct(firstItem.stock, firstItem.minimumStock)}%` }} /></span>
                            </span>
                            <span className="price-cell">{business.currency} {firstItem.price.toFixed(2)}</span>
                          </div>
                        );
                      }

                      return (
                        <Fragment key={group.key}>
                          <div className={`table-row inventory-group-row${expanded ? " expanded" : ""}`}>
                            <span className="product-cell inventory-group-cell">
                              <span className="product-thumb">{group.name[0]}</span>
                              <button
                                className="inventory-group-toggle"
                                type="button"
                                aria-expanded={expanded}
                                aria-label={`${expanded ? "Hide" : "Show"} ${group.items.length} variants for ${group.name}`}
                                onClick={() => toggleInventoryGroup(group.key)}
                              >
                                <span>
                                  <strong>{group.name}</strong>
                                  <small>{group.items.length} variants</small>
                                </span>
                                <span className="inventory-group-chevron" aria-hidden="true">⌄</span>
                              </button>
                            </span>
                            <span className="category-cell">{group.category}</span>
                            <span className={`stock-cell ${group.stock === 0 ? "empty" : ""}`}>
                              {group.stock}
                              <small>Across variants</small>
                            </span>
                            <span className="price-cell">{group.price}</span>
                          </div>
                          {expanded && group.items.map((item) => (
                            <div className="table-row inventory-variant-row" key={item.key}>
                              <span className="product-cell inventory-variant-cell">
                                <span className="inventory-variant-marker" aria-hidden="true" />
                                <span>
                                  <strong>{[item.color, item.size].filter(Boolean).join(" · ") || "Standard variant"}</strong>
                                  <small>{item.sku}</small>
                                </span>
                              </span>
                              <span className="category-cell">{item.category}</span>
                              <span className={`stock-cell ${item.stock === 0 ? "empty" : item.stock <= item.minimumStock ? "low" : ""}`}>
                                {item.stock}
                                <small>{item.stock === 0 ? "Out of stock" : item.stock <= item.minimumStock ? "Low stock" : "In stock"}</small>
                                <span className="stock-meter" aria-hidden="true"><i style={{ width: `${stockLevelPct(item.stock, item.minimumStock)}%` }} /></span>
                              </span>
                              <span className="price-cell">{business.currency} {item.price.toFixed(2)}</span>
                            </div>
                          ))}
                        </Fragment>
                      );
                    })}
                  </div>
                <footer className="overview-pagination"><span>Showing {(currentOverviewPage - 1) * 8 + 1}–{Math.min(currentOverviewPage * 8, overviewRows.length)} of {overviewRows.length} products</span><div><button type="button" disabled={currentOverviewPage === 1} onClick={() => setOverviewPage(currentOverviewPage - 1)}>Previous</button><span>{currentOverviewPage} / {overviewPages}</span><button type="button" disabled={currentOverviewPage === overviewPages} onClick={() => setOverviewPage(currentOverviewPage + 1)}>Next</button></div></footer></AsyncBoundary>
              </section>
              <aside className="alerts-section">
                <div className="section-heading">
                  <div>
                    <p className="dashboard-kicker">Needs your attention</p>
                    <h2>Stock alerts</h2>
                  </div>
                  <button
                    className="stock-alert-toggle"
                    type="button"
                    aria-expanded={stockAlertsOpen}
                    aria-controls="stock-alert-content"
                    aria-label={`${stockAlertsOpen ? "Collapse" : "Expand"} stock alerts`}
                    onClick={() => setStockAlertsOpen((current) => !current)}
                  >
                    <span className="alert-count">{notifItems.length}</span>
                    <svg className="stock-alert-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </div>
                {stockAlertsOpen && <div className="stock-alert-content" id="stock-alert-content">
                {notifItems.length === 0 ? (
                  <div className="alert-list">
                    <div className="notif-empty">
                      <span aria-hidden="true">✓</span>
                      <strong>You're all caught up</strong>
                      <p>No alerts right now.</p>
                    </div>
                  </div>
                ) : (
                  <div className="alert-list">
                    {notifItems.map((item) => (
                      <button
                        className="alert-item"
                        type="button"
                        key={item.key}
                        onClick={() => openNotification(item.navTo)}
                      >
                        <span
                          className={`alert-symbol ${item.severity === "critical" ? "empty-alert" : ""}`}
                        >
                          {item.severity === "info" ? "i" : "!"}
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>{item.secondary}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  className="restock-button"
                  type="button"
                  onClick={() => navigateTo("Purchase Orders")}
                >
                  Create purchase order <span>+</span>
                </button>
                </div>}
              </aside>
            </div>
            <footer className="overview-footer">
              <span><b>Stockroom</b> · Retail &amp; warehouse management</span>
              <span>{(products || []).length} SKUs indexed · Branch {(business.city || business.country || "Main outlet").toUpperCase()}</span>
            </footer>
          </>
        ) : activeNav === "Products" || activeNav === "Medicines" ? (
          <Products business={business} account={account} />
        ) : activeNav === "Bulk Import" ? (
          <ProductImport business={business} />
        ) : [
            "Categories",
            "Stock",
            "Stock In",
            "Stock Out",
            "Adjustments",
            "Stock History",
          ].includes(activeNav) ? (
          <InventoryOperations
            section={activeNav}
            business={business}
            account={account}
            onNavigate={navigateTo}
            canNavigate={canOpen}
          />
        ) : ["Users", "Roles", "Permissions"].includes(activeNav) ? (
          <UserManagement
            section={activeNav}
            business={business}
            account={account}
          />
        ) : activeNav === "Suppliers" ? (
          <Suppliers business={business} onNavigate={navigateTo} canNavigate={canOpen} />
        ) : activeNav === "Customers" ? (
          <Customers business={business} onNavigate={navigateTo} />
        ) : activeNav === "Purchase Orders" ? (
          <PurchaseOrders business={business} account={account} onNavigate={navigateTo} />
        ) : activeNav === "Receiving" ? (
          <Receiving business={business} account={account} onNavigate={navigateTo} />
        ) : activeNav === "Orders" ? (
          <SalesOrders business={business} account={account} creditSales={["Credit Sales", "Bulk Orders"].includes(activeNav)} section={activeNav} />
        ) : activeNav === "POS / Billing" ? (
          <POS business={business} account={account} />
        ) : activeNav === "Payments" ? (
          <Payments business={business} account={account} />
        ) : activeNav === "Business Profile" || activeNav === "Industry" ? (
          <BusinessSettings
            section={activeNav}
            business={business}
            onBusinessUpdate={onBusinessUpdate}
            onBusinessDeleted={onLogout}
          />
        ) : activeNav === "Settings" ? (
          <Settings business={business} onBusinessUpdate={onBusinessUpdate} />
        ) : activeNav === "Reports" ? (
          <Reports business={business} />
        ) : activeNav === "Returns" || activeNav === "Purchase Returns" ? (
          <Returns
            business={business}
            account={account}
            purchase={activeNav === "Purchase Returns"}
          />
        ) : activeNav === "Color Management" ? (
          <ColorManagement business={business} account={account} />
        ) : ["Variant Grid", "Replenishment", "Promotions", "Loyalty", "Coupons", "Gift Cards", "Cashier Shifts", "Clothing Reports"].includes(activeNav) ? (
          <ClothingModule section={activeNav} business={business} account={account} />
        ) : activeNav === "Bulk Pricing" ? (<BulkPricing business={business} account={account} />) : ["Batch Management", "Expiry Tracking", "Prescription Management", "Size Management", "Product Variants", "Serial Numbers", "Warranty Tracking", "Offers / Discounts", "Raw Materials", "Bill of Materials", "Production", "Finished Goods", "Production Tracking"].includes(activeNav) ? (
          <IndustryModule section={activeNav} business={business} onNavigate={navigateTo} />
        ) : activeNav === "Bulk Orders" || activeNav === "Credit Sales" ? (
          <SalesOrders business={business} account={account} creditSales={["Credit Sales", "Bulk Orders"].includes(activeNav)} section={activeNav} />
        ) : (
          <div className="empty-dashboard">
            <span className="empty-dashboard-icon">◫</span>
            <h2>{activeNav}</h2>
            <p>
              This module is ready for the next step of your inventory
              workspace.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

const AUTH_COPY = {
  signin: {
    eyebrow: "Welcome back",
    title: (
      <>
        Sign in to your
        <br />
        workspace
      </>
    ),
    subtitle: "Choose your account type to continue.",
    submit: "Sign in",
  },
  signup: {
    eyebrow: "Get started",
    title: (
      <>
        Create your
        <br />
        workspace
      </>
    ),
    subtitle: "Set up your account in a few seconds.",
    submit: "Create account",
  },
  forgot: {
    eyebrow: "Account recovery",
    title: (
      <>
        Reset your
        <br />
        password
      </>
    ),
    subtitle: "Enter your work email and we will issue a reset code.",
    submit: "Send reset code",
  },
  reset: {
    eyebrow: "Account recovery",
    title: (
      <>
        Choose a new
        <br />
        password
      </>
    ),
    subtitle: "Paste your reset code and pick a new password.",
    submit: "Update password",
  },
};

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("stockroom-theme") || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [initialReset] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("reset") || "";
    } catch {
      return "";
    }
  });
  const [mode, setMode] = useState(initialReset ? "reset" : "signin");
  const [role, setRole] = useState("owner");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [booting, setBooting] = useState(Boolean(getCsrfToken()) && !initialReset);
  const [session, setSession] = useState(null);
  const [initialNav, setInitialNav] = useState("Overview");
  const [resetToken, setResetToken] = useState(initialReset);
  const copy = AUTH_COPY[mode];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("stockroom-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (initialReset) return;
    let active = true;
    authApi
      .me()
      .then((result) => {
        if (active)
          setSession({ user: result.user, business: result.business });
      })
      .catch(() => {
        if (active) setMessage(null);
      })
      .finally(() => active && setBooting(false));
    return () => {
      active = false;
    };
  }, [initialReset]);

  useEffect(() => {
    const handleUnauthorized = () => {
      authApi.logout().catch(() => {
        /* best effort - the cookie is already invalid server-side */
      });
      setSession(null);
      setMessage({
        type: "error",
        text: "Your session ended. Please sign in again.",
      });
    };
    window.addEventListener("stockroom:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("stockroom:unauthorized", handleUnauthorized);
  }, []);

  const goToMode = (next) => {
    setMode(next);
    setMessage(null);
    setShowPassword(false);
  };

  const clearResetUrl = () => {
    try {
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      /* history unavailable - non-fatal */
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") || "")
      .trim()
      .toLowerCase();
    const password = String(data.get("password") || "");

    if (mode === "forgot") {
      setSubmitting(true);
      try {
        const result = await authApi.forgotPassword({ email });
        setResetToken(result.resetToken || "");
        setMode("reset");
        setShowPassword(false);
        setMessage({
          type: "success",
          text: result.resetToken
            ? `Reset code created for ${result.email}. It is filled in below - set a new password.`
            : result.message,
        });
      } catch (error) {
        setMessage({ type: "error", text: error.message });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (mode === "reset") {
      const token = String(data.get("token") || "").trim();
      if (!token)
        return setMessage({
          type: "error",
          text: "Enter the reset code from your email.",
        });
      if (password.length < 8)
        return setMessage({
          type: "error",
          text: "Your password must contain at least 8 characters.",
        });
      if (password !== data.get("confirmPassword"))
        return setMessage({
          type: "error",
          text: "The passwords do not match.",
        });
      setSubmitting(true);
      try {
        const result = await authApi.resetPassword({ token, password });
        clearResetUrl();
        setSession({ user: result.user, business: result.business });
        setMessage(null);
      } catch (error) {
        setMessage({ type: "error", text: error.message });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (mode === "signup") {
      if (password.length < 8)
        return setMessage({
          type: "error",
          text: "Your password must contain at least 8 characters.",
        });
      if (password !== data.get("confirmPassword"))
        return setMessage({
          type: "error",
          text: "The passwords do not match.",
        });
      setSubmitting(true);
      try {
        await authApi.register({ email, password, role });
        setMode("signin");
        setMessage({
          type: "success",
          text: "Account created. Sign in to open your workspace.",
        });
        form.reset();
      } catch (error) {
        setMessage({ type: "error", text: error.message });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const result = await authApi.login({ email, password, role });
      setSession({ user: result.user, business: result.business });
      setMessage(null);
      form.reset();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    authApi.logout().catch(() => {
      /* clear local state regardless of the network result */
    });
    setSession(null);
    setMode("signin");
    setMessage(null);
  };

  if (booting)
    return <div className="app-loading">Loading your workspace…</div>;

  const needsOwnerOnboarding = session?.user?.role === 'owner' && session.user.onboarding && session.user.onboarding.status !== 'completed';
  if (session && (!session.business || needsOwnerOnboarding)) {
    return (
      <BusinessSetup
        account={session.user}
        business={session.business}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")}
        onSession={(result) => {
          setSession({ user: result.user, business: result.business });
        }}
        onComplete={(result) => {
          setInitialNav(result.initialNav || "Overview");
          setSession({ user: result.user, business: result.business });
        }}
      />
    );
  }

  if (session) {
    return (
      <Dashboard
        account={session.user}
        business={session.business}
        initialNav={initialNav}
        onLogout={handleLogout}
        onBusinessUpdate={(business) =>
          setSession((current) => ({ ...current, business }))
        }
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")}
      />
    );
  }

  const aside =
    mode === "signup"
      ? {
          title: "One of us?",
          body: "Already have a Stockroom workspace? Sign in to pick up your inventory, billing and reports.",
          cta: "Sign In",
          go: "signin",
        }
      : mode === "forgot" || mode === "reset"
      ? {
          title: "Remembered it?",
          body: "Head back to the sign in screen and continue into your workspace.",
          cta: "Back to sign in",
          go: "signin",
        }
      : {
          title: "New Here?",
          body: "Create your Stockroom workspace and manage inventory, POS billing, sales, purchases and suppliers in one place.",
          cta: "Sign Up",
          go: "signup",
        };

  return (
    <main className="auth-motion-stage">
      <button className="public-theme-toggle" type="button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
        <span aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span> {theme === "dark" ? "Light" : "Dark"}
      </button>
      <MotionConfig transition={{ type: "spring", bounce: 0.24, visualDuration: 0.45 }}>
        <div className="auth-split">
          <aside className="auth-split-aside">
            <span className="auth-blob auth-blob-a" aria-hidden="true" />
            <span className="auth-blob auth-blob-b" aria-hidden="true" />
            <div className="auth-aside-inner">
              <span className="auth-aside-badge" aria-hidden="true">
                <span className="mark-icon"><span /></span>
              </span>
              <h2>{aside.title}</h2>
              <p>{aside.body}</p>
              <button
                type="button"
                className="auth-aside-btn"
                onClick={() => {
                  if (mode === "forgot" || mode === "reset") clearResetUrl();
                  goToMode(aside.go);
                }}
              >
                {aside.cta}
              </button>
              <ul className="auth-aside-features">
                <li>Inventory &amp; stock tracking</li>
                <li>POS &amp; billing</li>
                <li>Sales &amp; purchase orders</li>
                <li>Customers &amp; suppliers</li>
                <li>Reports &amp; low-stock alerts</li>
              </ul>
            </div>
          </aside>
          <AnimatePresence mode="wait">
          <motion.section className="auth-split-form" key={mode} initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 30, scale: 0.97 }}>
          <div className="auth-split-inner">
          <header className="auth-split-brand"><span className="mark-icon" aria-hidden="true"><span /></span><span>stockroom</span></header>
          <div className="form-heading">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2>{copy.title}</h2>
            <p className="form-subtitle">{copy.subtitle}</p>
          </div>
          {(mode === "signin" || mode === "signup") && (
            <div
              className="role-switch"
              role="tablist"
              aria-label="Account type"
            >
              <button
                className={role === "owner" ? "active" : ""}
                type="button"
                onClick={() => setRole("owner")}
              >
                ⌂ Shop owner
              </button>
              <button
                className={role === "team" ? "active" : ""}
                type="button"
                onClick={() => setRole("team")}
              >
                ♧ Team member
              </button>
            </div>
          )}
          <form onSubmit={handleSubmit}>
            {mode !== "reset" && (
              <>
                <label htmlFor="email">Work email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="you@yourbusiness.com"
                />
              </>
            )}
            {mode === "reset" && (
              <>
                <label htmlFor="token">Reset code</label>
                <input
                  id="token"
                  name="token"
                  required
                  placeholder="Paste the code from your email"
                  defaultValue={resetToken}
                />
              </>
            )}
            {mode !== "forgot" && (
              <>
                <div className="password-label">
                  <label htmlFor="password">
                    {mode === "reset" ? "New password" : "Password"}
                  </label>
                </div>
                <div className="password-field">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder={
                      mode === "reset"
                        ? "At least 8 characters"
                        : "Enter your password"
                    }
                  />
                  <button
                    type="button"
                    className="show-password"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </>
            )}
            {(mode === "signup" || mode === "reset") && (
              <>
                <label htmlFor="confirmPassword">Confirm password</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Repeat your password"
                />
              </>
            )}
            <button
              className="submit-button"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Please wait…" : copy.submit} <span>→</span>
            </button>
            {message && (
              <p className={`form-status ${message.type}`}>{message.text}</p>
            )}
          </form>
          {mode === "signin" && (
            <a
              className="auth-forgot"
              href="#forgot"
              onClick={(event) => {
                event.preventDefault();
                goToMode("forgot");
              }}
            >
              Forgot Password?
            </a>
          )}
          <p className="legal">
            By continuing, you agree to our <a href="#terms">Terms</a> and{" "}
            <a href="#privacy">Privacy Policy</a>.
          </p>
          </div>
        </motion.section>
        </AnimatePresence>
        </div>
      </MotionConfig>
    </main>
  );
}

export default App;
