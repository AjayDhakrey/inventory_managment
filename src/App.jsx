import { useCallback, useEffect, useState } from "react";
import "./App.css";
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
import {
  BusinessSettings,
  Settings,
  Reports,
  Returns,
} from "./components/RemainingModules.jsx";
import AsyncBoundary from "./components/AsyncBoundary.jsx";
import NotificationCenter from "./components/NotificationCenter.jsx";
import { navigation } from "./constants/navigation.js";
import { authApi } from "./api/authApi.js";
import { productApi } from "./api/productApi.js";
import { getToken, setToken } from "./api/client.js";
import { useResource } from "./hooks/useResource.js";

const LOW_STOCK_LIMIT = 10;
function Dashboard({ account, business, onLogout, onBusinessUpdate }) {
  const [activeNav, setActiveNav] = useState("Overview");
  const [search, setSearch] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notif, setNotif] = useState({ items: [], unreadCount: 0 });

  const loadProducts = useCallback(() => productApi.list(), []);
  const {
    data: products,
    loading,
    error,
    refetch,
  } = useResource(loadProducts, [], []);

  const notifItems = (notif?.items || [])
    .filter((item) =>
      ["inventory", "purchases", "payments"].includes(item.category),
    )
    .slice(0, 6);
  const permissions = account.permissions || [];
  const can = (permission) =>
    account.role === "owner" || permissions.includes(permission);
  const navPermission = {
    "Business Profile": "manage_users", Settings: "manage_users", Users: "manage_users", Roles: "manage_users", Permissions: "manage_users",
    Products: "view_inventory", "Bulk Import": ["create_product", "stock_in"], Categories: "view_inventory", Stock: "view_inventory",
    "Stock In": "stock_in", "Stock Out": "stock_out", Adjustments: "edit_product", "Stock History": "view_inventory",
    Suppliers: "view_inventory", "Purchase Orders": "view_inventory", Receiving: "stock_in", "POS / Billing": "process_pos_sale",
    Orders: "create_order", Customers: "create_order", Returns: "create_order", Payments: "view_reports",
  };
  const canOpen = (item) => {
    const required = navPermission[item];
    return !required || (Array.isArray(required) ? required.every(can) : can(required));
  };
  const visibleNavigation = navigation
    .map(([section, items]) => [section, items.filter(canOpen)])
    .filter(([section, items]) => section === "Reports" ? can("view_reports") : items.length > 0);
  const openNotification = (navTo) => {
    setActiveNav(navTo);
  };
  const overviewProducts = (products || []).map((product) => [
    product.name,
    product.sku,
    product.category,
    product.currentStock,
    `${business.currency} ${Number(product.sellingPrice).toFixed(2)}`,
    product.currentStock === 0
      ? "Out of stock"
      : product.currentStock <= (product.minimumStock || LOW_STOCK_LIMIT)
        ? "Low stock"
        : "In stock",
  ]);
  const filteredItems = overviewProducts.filter((item) =>
    `${item[0]} ${item[1]} ${item[2]}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand brand-mark">
          <span className="mark-icon" aria-hidden="true">
            <span />
          </span>
          <span>stockroom</span>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-avatar">
            {(business?.name || "Your business")[0].toUpperCase()}
          </span>
          <span>
            <small>Workspace</small>
            <strong>{business?.name || "Your business"}</strong>
          </span>
          <span className="chevron">⌄</span>
        </div>
        <nav className="module-nav" aria-label="Main navigation">
          <button
            className={activeNav === "Overview" ? "active" : ""}
            type="button"
            onClick={() => setActiveNav("Overview")}
          >
            <span className="nav-symbol">▦</span>Overview
          </button>
          {visibleNavigation.map(([section, items], index) => (
            <div className="nav-group" key={section}>
              <button
                className={activeNav === section ? "active" : ""}
                type="button"
                onClick={() => setActiveNav(section)}
              >
                <span className="nav-symbol">
                  {["◫", "♧", "▣", "↗", "⌁", "◒", "⚙"][index]}
                </span>
                {section}
                <span className="nav-chevron">{items.length ? "⌄" : ""}</span>
              </button>
              {items.length > 0 && (
                <div className="nav-children">
                  {items.map((item) => (
                    <button
                      className={activeNav === item ? "active" : ""}
                      type="button"
                      key={item}
                      onClick={() => setActiveNav(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button type="button" onClick={onLogout}>
            <span className="nav-symbol">↪</span>Log out
          </button>
        </div>
      </aside>
      <section className="dashboard-main">
        <div className="business-context">
          <span className="business-context-dot" />{" "}
          {business?.name || "Your business"} <span>/</span>{" "}
          {business?.industry || "workspace"}
        </div>
        <header className="dashboard-header">
          <div>
            <p className="dashboard-kicker">
              {activeNav === "Overview"
                ? "Monday, August 31, 2026"
                : `Manage your ${activeNav.toLowerCase()}`}
            </p>
            <h1>
              {activeNav === "Overview" ? "Good morning, Maison." : activeNav}
            </h1>
          </div>
          <div className="header-actions">
            <NotificationCenter
              onNavigate={openNotification}
              onOpen={() => setShowUserMenu(false)}
              onChange={setNotif}
            />
            <div className="header-popover-wrap">
              <button
                className="user-chip"
                type="button"
                aria-expanded={showUserMenu}
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <span className="user-avatar">
                  {account.email[0].toUpperCase()}
                </span>
                <span>{account.email.split("@")[0]}</span>
                <span className="chevron">⌄</span>
              </button>
              {showUserMenu && (
                <div className="header-popover user-popover">
                  <div className="popover-user">
                    <span className="user-avatar">
                      {account.email[0].toUpperCase()}
                    </span>
                    <span>
                      <strong>{account.email.split("@")[0]}</strong>
                      <small>{account.email}</small>
                    </span>
                  </div>
                  <div className="popover-detail">
                    <span>Business</span>
                    <strong>{business.name}</strong>
                    <span>Role</span>
                    <strong>
                      {account.roleId === "ROLE-ADMIN" ||
                      account.role === "owner"
                        ? "Admin"
                        : account.role || "Team member"}
                    </strong>
                  </div>
                  <button
                    className="popover-logout"
                    type="button"
                    onClick={onLogout}
                  >
                    Log out <span>↪</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {activeNav === "Overview" ? (
          <>
            <PosDashboardStats
              business={business}
              onOpen={() => setActiveNav("POS / Billing")}
            />
            <div className="summary-row">
              <article className="summary-card dark-card">
                <span className="summary-label">Inventory value</span>
                <strong>$24,680</strong>
                <span className="trend positive">
                  ↗ 12.4% <small>vs last month</small>
                </span>
              </article>
              <article className="summary-card">
                <span className="summary-label">Items in stock</span>
                <strong>1,284</strong>
                <span className="trend positive">
                  ↗ 8.2% <small>vs last month</small>
                </span>
              </article>
              <article className="summary-card">
                <span className="summary-label">Open orders</span>
                <strong>36</strong>
                <span className="trend neutral">
                  → 3.1% <small>vs last month</small>
                </span>
              </article>
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
                    onClick={() => setActiveNav("Products")}
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
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search products or SKU"
                    />
                  </div>
                </div>
                <AsyncBoundary
                  loading={loading}
                  error={error}
                  onRetry={refetch}
                  isEmpty={!filteredItems.length}
                  emptyText={
                    overviewProducts.length
                      ? "No products match your search."
                      : "No products yet. Add your first product from the Products screen."
                  }
                >
                  <div className="inventory-table">
                    <div className="table-row table-head">
                      <span>Product</span>
                      <span>Category</span>
                      <span>Stock</span>
                      <span>Price</span>
                    </div>
                    {filteredItems.map((item) => (
                      <div className="table-row" key={item[1]}>
                        <span className="product-cell">
                          <span className="product-thumb">{item[0][0]}</span>
                          <span>
                            <strong>{item[0]}</strong>
                            <small>{item[1]}</small>
                          </span>
                        </span>
                        <span className="category-cell">{item[2]}</span>
                        <span
                          className={`stock-cell ${item[3] === 0 ? "empty" : item[3] < 10 ? "low" : ""}`}
                        >
                          {item[3]}
                          <small>{item[5]}</small>
                        </span>
                        <span className="price-cell">{item[4]}</span>
                      </div>
                    ))}
                  </div>
                </AsyncBoundary>
              </section>
              <aside className="alerts-section">
                <div className="section-heading">
                  <div>
                    <p className="dashboard-kicker">Needs your attention</p>
                    <h2>Stock alerts</h2>
                  </div>
                  <span className="alert-count">{notifItems.length}</span>
                </div>
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
                  onClick={() => setActiveNav("Purchase Orders")}
                >
                  Create purchase order <span>+</span>
                </button>
              </aside>
            </div>
          </>
        ) : activeNav === "Products" ? (
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
          />
        ) : ["Users", "Roles", "Permissions"].includes(activeNav) ? (
          <UserManagement
            section={activeNav}
            business={business}
            account={account}
          />
        ) : activeNav === "Suppliers" ? (
          <Suppliers business={business} />
        ) : activeNav === "Customers" ? (
          <Customers business={business} />
        ) : activeNav === "Purchase Orders" ? (
          <PurchaseOrders business={business} account={account} />
        ) : activeNav === "Receiving" ? (
          <Receiving business={business} account={account} />
        ) : activeNav === "Orders" ? (
          <SalesOrders business={business} account={account} />
        ) : activeNav === "POS / Billing" ? (
          <POS business={business} account={account} />
        ) : activeNav === "Payments" ? (
          <Payments business={business} account={account} />
        ) : activeNav === "Business Profile" || activeNav === "Industry" ? (
          <BusinessSettings
            section={activeNav}
            business={business}
            onBusinessUpdate={onBusinessUpdate}
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
  const [booting, setBooting] = useState(Boolean(getToken()) && !initialReset);
  const [session, setSession] = useState(null);
  const [resetToken, setResetToken] = useState(initialReset);
  const copy = AUTH_COPY[mode];

  useEffect(() => {
    if (!getToken() || initialReset) return;
    let active = true;
    authApi
      .me()
      .then((result) => {
        if (active)
          setSession({ user: result.user, business: result.business });
      })
      .catch(() => {
        if (active) {
          setToken(null);
          setMessage(null);
        }
      })
      .finally(() => active && setBooting(false));
    return () => {
      active = false;
    };
  }, [initialReset]);

  useEffect(() => {
    const handleUnauthorized = () => {
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
        setToken(result.token);
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
      setToken(result.token);
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
    setToken(null);
    setSession(null);
    setMode("signin");
    setMessage(null);
  };

  if (booting)
    return <div className="app-loading">Loading your workspace…</div>;

  if (session && !session.business) {
    return (
      <BusinessSetup
        onComplete={(result) => {
          setToken(result.token);
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
        onLogout={handleLogout}
        onBusinessUpdate={(business) =>
          setSession((current) => ({ ...current, business }))
        }
      />
    );
  }

  return (
    <main className="login-shell">
      <section className="brand-panel">
        <header className="brand-mark">
          <span className="mark-icon" aria-hidden="true">
            <span />
          </span>
          <span>stockroom</span>
        </header>
        <div className="brand-copy">
          <p className="eyebrow">One clear view of your business</p>
          <h1>
            Make room
            <br />
            <em>to grow.</em>
          </h1>
          <p className="intro">
            Inventory, orders, and every location in sync. Stockroom keeps your
            team moving and your shelves honest.
          </p>
        </div>
        <div className="panel-footer">
          <span className="signal-dot" />
          <span>Trusted by 2,400+ independent businesses</span>
          <span className="footer-year">2024</span>
        </div>
      </section>
      <section className="form-panel">
        <div className="form-wrap">
          <div className="mobile-mark brand-mark">
            <span className="mark-icon" aria-hidden="true">
              <span />
            </span>
            <span>stockroom</span>
          </div>
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
                  {mode === "signin" && (
                    <a
                      href="#forgot"
                      onClick={(event) => {
                        event.preventDefault();
                        goToMode("forgot");
                      }}
                    >
                      Forgot password?
                    </a>
                  )}
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
          <p className="signup">
            {mode === "signin" && (
              <>
                New to Stockroom?{" "}
                <a
                  href="#signup"
                  onClick={(event) => {
                    event.preventDefault();
                    goToMode("signup");
                  }}
                >
                  Create an account ↗
                </a>
              </>
            )}
            {mode === "signup" && (
              <>
                Already have an account?{" "}
                <a
                  href="#signin"
                  onClick={(event) => {
                    event.preventDefault();
                    goToMode("signin");
                  }}
                >
                  Sign in ↗
                </a>
              </>
            )}
            {(mode === "forgot" || mode === "reset") && (
              <>
                Remembered it?{" "}
                <a
                  href="#signin"
                  onClick={(event) => {
                    event.preventDefault();
                    clearResetUrl();
                    goToMode("signin");
                  }}
                >
                  Back to sign in ↗
                </a>
              </>
            )}
          </p>
          <p className="legal">
            By continuing, you agree to our <a href="#terms">Terms</a> and{" "}
            <a href="#privacy">Privacy Policy</a>.
          </p>
        </div>
      </section>
    </main>
  );
}

export default App;
