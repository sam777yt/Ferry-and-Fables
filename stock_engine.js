/* ============================================================
   FERRY & FABLE - INVENTORY & STOCK ENGINE
   Centralized stock, reservation, audit logging & overselling guards
   ============================================================ */

const STOCK_STORAGE_KEY    = "ff_products";
const ORDERS_STORAGE_KEY   = "ff_orders";
const HISTORY_STORAGE_KEY  = "ff_stock_history";
const SETTINGS_STORAGE_KEY = "ff_settings";
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

// Global memory cache helper
function getStockSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Checks if the stock tracking engine is active globally and for an optional product.
 * If global stockSystemEnabled is false, stock management is completely bypassed.
 * If a product has trackStock === false, stock management is bypassed for that product.
 */
function isStockSystemActive(product = null) {
  const s = getStockSettings();
  if (s.stockSystemEnabled === false) {
    return false;
  }
  if (product && product.trackStock === false) {
    return false;
  }
  return true;
}

function isStockActiveForProductId(productId) {
  const s = getStockSettings();
  if (s.stockSystemEnabled === false) return false;
  if (!productId) return true;
  try {
    const prods = getStoredProducts();
    const p = prods.find(x => x.id === productId);
    if (p && p.trackStock === false) return false;
  } catch {}
  return true;
}

function getLowStockThreshold(product) {
  if (product && typeof product.lowStockThreshold === "number" && product.lowStockThreshold >= 0) {
    return product.lowStockThreshold;
  }
  const s = getStockSettings();
  if (typeof s.lowStockThreshold === "number" && s.lowStockThreshold >= 0) {
    return s.lowStockThreshold;
  }
  return DEFAULT_LOW_STOCK_THRESHOLD;
}

/* ─── VARIANT KEY & LABEL HELPERS ───────────────────────── */
function makeVariantKey(size, color) {
  const s = (size || "").trim();
  const c = (color || "").trim();
  if (!s && !c) return "default";
  return `${s}__${c}`;
}

function parseVariantKey(vKey) {
  if (!vKey || vKey === "default") return { size: "", color: "" };
  const parts = vKey.split("__");
  return { size: parts[0] || "", color: parts[1] || "" };
}

function formatVariantLabel(size, color) {
  const parts = [];
  if (color) parts.push(color);
  if (size) parts.push(size);
  return parts.length ? parts.join(" / ") : "Standard";
}

/* ─── ENSURE & INITIALIZE PRODUCT STOCKS ──────────────────── */
function ensureProductStock(product) {
  if (!product) return product;

  if (!product.variantStock || typeof product.variantStock !== "object") {
    product.variantStock = {};
  }

  const sizes  = Array.isArray(product.sizes)  && product.sizes.length  ? product.sizes  : [""];
  const colors = Array.isArray(product.colors) && product.colors.length ? product.colors : [""];

  const isOutOfStockInit = product.stock === "out_of_stock";
  const defaultQty = isOutOfStockInit ? 0 : 20;

  sizes.forEach(s => {
    colors.forEach(c => {
      const vKey = makeVariantKey(s, c);
      if (typeof product.variantStock[vKey] !== "number") {
        if (typeof product.stockQty === "number") {
          product.variantStock[vKey] = product.stockQty;
        } else {
          product.variantStock[vKey] = defaultQty;
        }
      }
    });
  });

  return product;
}

function getStoredProducts() {
  if (Array.isArray(window.ffProductCache)) return window.ffProductCache;
  try {
    const raw = localStorage.getItem(STOCK_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : (typeof PRODUCTS !== "undefined" ? [...PRODUCTS] : []);
    let modified = false;
    list.forEach(p => {
      if (!p.variantStock) {
        ensureProductStock(p);
        modified = true;
      }
    });
    if (modified) {
      localStorage.setItem(STOCK_STORAGE_KEY, JSON.stringify(list));
    }
    return list;
  } catch {
    return typeof PRODUCTS !== "undefined" ? [...PRODUCTS] : [];
  }
}

function saveStoredProducts(products) {
  window.ffProductCache = products;
  try {
    localStorage.setItem(STOCK_STORAGE_KEY, JSON.stringify(products));
  } catch (e) {}
}

function getStoredOrders() {
  if (window.ffOrdersCache) return window.ffOrdersCache;
  try {
    return JSON.parse(localStorage.getItem(ORDERS_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

/* ─── STOCK INVENTORY CALCULATIONS ───────────────────────── */
function getActualStock(productId, size, color) {
  const products = getStoredProducts();
  const p = products.find(x => x.id === productId);
  if (!p) return 0;
  ensureProductStock(p);

  const vKey = makeVariantKey(size, color);
  if (typeof p.variantStock[vKey] === "number") {
    return p.variantStock[vKey];
  }

  const keys = Object.keys(p.variantStock);
  if (keys.length > 0) return p.variantStock[keys[0]] || 0;
  return typeof p.stockQty === "number" ? p.stockQty : 0;
}

function getReservedStock(productId, size, color) {
  const orders = getStoredOrders();
  const targetKey = makeVariantKey(size, color);
  let reserved = 0;

  orders.forEach(o => {
    if (o.status === "pending") {
      (o.items || []).forEach(it => {
        if (it.id === productId) {
          const itKey = makeVariantKey(it.size, it.color);
          if (itKey === targetKey || (!it.size && !it.color && targetKey === "default")) {
            reserved += (Number(it.qty) || 0);
          }
        }
      });
    }
  });

  return reserved;
}

function getAvailableStock(productId, size, color) {
  if (!isStockActiveForProductId(productId)) {
    try {
      const prods = getStoredProducts();
      const p = prods.find(x => x.id === productId);
      if (p && p.stock === "out_of_stock") return 0;
    } catch {}
    return 999999;
  }
  const actual = getActualStock(productId, size, color);
  const reserved = getReservedStock(productId, size, color);
  return Math.max(0, actual - reserved);
}

function getProductStockSummary(product) {
  if (!product) return { actual: 0, reserved: 0, available: 0, status: "out_of_stock", isLow: false, isTracking: false };

  // If the stock system is inactive globally or for this product
  if (!isStockSystemActive(product)) {
    const isOut = product.stock === "out_of_stock";
    const isHidden = product.stock === "hidden";
    return {
      actual: 999999,
      reserved: 0,
      available: isOut ? 0 : 999999,
      threshold: 0,
      status: isHidden ? "hidden" : (isOut ? "out_of_stock" : "in_stock"),
      isLow: false,
      isTracking: false
    };
  }

  ensureProductStock(product);

  const orders = getStoredOrders();
  let actualTotal = 0;
  let reservedTotal = 0;

  Object.entries(product.variantStock || {}).forEach(([vKey, qty]) => {
    actualTotal += (Number(qty) || 0);
  });

  orders.forEach(o => {
    if (o.status === "pending") {
      (o.items || []).forEach(it => {
        if (it.id === product.id) {
          reservedTotal += (Number(it.qty) || 0);
        }
      });
    }
  });

  const availableTotal = Math.max(0, actualTotal - reservedTotal);
  const threshold = getLowStockThreshold(product);

  let status = "in_stock";
  if (product.stock === "hidden") {
    status = "hidden";
  } else if (availableTotal <= 0) {
    status = "out_of_stock";
  } else if (availableTotal <= threshold) {
    status = "low_stock";
  }

  return {
    actual: actualTotal,
    reserved: reservedTotal,
    available: availableTotal,
    threshold,
    status,
    isLow: status === "low_stock",
    isTracking: true
  };
}

/* ─── STOCK HISTORY (AUDIT LOG) ──────────────────────────── */
function loadStockHistory() {
  if (window.ffHistoryCache) return window.ffHistoryCache;
  try {
    return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function recordStockHistory(entry) {
  const all = loadStockHistory();
  const record = {
    id: "sh_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    timestamp: new Date().toISOString(),
    productId: entry.productId || "",
    productName: entry.productName || "Product",
    variantKey: entry.variantKey || "default",
    variantLabel: entry.variantLabel || "Standard",
    delta: entry.delta || 0,
    prevStock: entry.prevStock ?? 0,
    newStock: entry.newStock ?? 0,
    action: entry.action || "manual_adjustment",
    reason: entry.reason || "Manual adjustment",
    actor: entry.actor || "Admin"
  };
  all.unshift(record);
  if (all.length > 500) all.length = 500;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(all));
  } catch (e) {}
  return record;
}

function clearStockHistory() {
  window.ffHistoryCache = [];
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, "[]");
  } catch (e) {}
}

/* ─── MANUAL STOCK ADJUSTMENT ────────────────────────────── */
function adjustProductStock(productId, size, color, delta, reason, actor = "Admin", actionType = "manual_adjustment") {
  const products = getStoredProducts();
  const p = products.find(x => x.id === productId);
  if (!p) return null;
  ensureProductStock(p);

  const vKey = makeVariantKey(size, color);
  const vLabel = formatVariantLabel(size, color);
  const prevStock = p.variantStock[vKey] || 0;
  const newStock = Math.max(0, prevStock + Number(delta));


  p.variantStock[vKey] = newStock;

  const summary = getProductStockSummary(p);
  if (p.stock !== "hidden") {
    p.stock = summary.available > 0 ? "in_stock" : "out_of_stock";
  }

  saveStoredProducts(products);

  recordStockHistory({
    productId: p.id,
    productName: p.name,
    variantKey: vKey,
    variantLabel: vLabel,
    delta: Number(delta),
    prevStock,
    newStock,
    action: actionType,
    reason: reason || (delta >= 0 ? `Added ${delta} to stock` : `Removed ${Math.abs(delta)} from stock`),
    actor
  });

  return { product: p, prevStock, newStock, delta };
}

/* ─── AUTOMATIC ORDER STATUS TRANSITIONS ─────────────────── */
function handleOrderStatusStockTransition(order, prevStatus, newStatus, actor = "Admin") {
  if (!order || prevStatus === newStatus) return;
  // If the stock system is globally disabled, skip stock deduction/release
  if (!isStockSystemActive()) return;

  const isDeducted = (status) => status === "confirmed" || status === "shipped" || status === "delivered";
  const wasDeducted = isDeducted(prevStatus);
  const willBeDeducted = isDeducted(newStatus);

  const items = order.items || [];

  if (!wasDeducted && willBeDeducted) {
    items.forEach(it => {
      if (!isStockActiveForProductId(it.id)) return;
      adjustProductStock(
        it.id,
        it.size,
        it.color,
        -Number(it.qty),
        `Order #${order.id} confirmed (Sold ${it.qty})`,
        actor,
        "order_confirmed"
      );
    });
  } else if (wasDeducted && !willBeDeducted) {
    items.forEach(it => {
      if (!isStockActiveForProductId(it.id)) return;
      adjustProductStock(
        it.id,
        it.size,
        it.color,
        +Number(it.qty),
        `Order #${order.id} ${newStatus} (Returned ${it.qty})`,
        actor,
        "order_returned"
      );
    });
  } else if (prevStatus === "pending" && newStatus === "cancelled") {
    items.forEach(it => {
      if (!isStockActiveForProductId(it.id)) return;
      const vLabel = formatVariantLabel(it.size, it.color);
      recordStockHistory({
        productId: it.id,
        productName: it.name,
        variantKey: makeVariantKey(it.size, it.color),
        variantLabel: vLabel,
        delta: 0,
        prevStock: getActualStock(it.id, it.size, it.color),
        newStock: getActualStock(it.id, it.size, it.color),
        action: "reservation_released",
        reason: `Order #${order.id} cancelled (Reserved ${it.qty} released)`,
        actor
      });
    });
  }
}

function checkOrderFulfillment(items) {
  const errors = [];
  // If stock system is disabled globally, always valid
  if (!isStockSystemActive()) {
    return {
      valid: true,
      errors: [],
      length: 0
    };
  }

  (items || []).forEach(it => {
    if (!isStockActiveForProductId(it.id)) return;
    const avail = getAvailableStock(it.id, it.size, it.color);
    const requested = Number(it.qty) || 1;
    if (requested > avail) {
      const vLabel = formatVariantLabel(it.size, it.color);
      const label = vLabel !== "Standard" ? `${it.name} (${vLabel})` : it.name;
      if (avail <= 0) {
        errors.push(`"${label}" is out of stock.`);
      } else {
        errors.push(`Only ${avail} available for "${label}" (you requested ${requested}).`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    length: errors.length
  };
}
