/* ============================================================
   DASHBOARD JS v3 — Ferry & Fable Owner Panel
   Features:
   - Full Product CRUD with Main & Multiple Extra Images
   - Stock Status (in_stock, out_of_stock, hidden) with Main Page sync
   - Sizes & Colors Manager with Presets & Custom inputs
   - Category Management (Add, Rename with Product Auto-Update, Delete)
   - Hero & Sections Editor (Men's & Women's collections)
   - Overview stats & storage meter
   - JSON Backup export & import
   ============================================================ */

/* ─── CONSTANTS ─────────────────────────────────────────── */
const STORAGE_KEY     = "ff_products";
const CATEGORIES_KEY  = "ff_categories";
const DEPARTMENTS_KEY = "ff_departments";
const SETTINGS_KEY    = "ff_settings";
const HERO_KEY        = "ff_hero";
const AUTH_KEY        = "ff_dash_auth";
const SESSION_KEY     = "ff_dash_session";
const DEFAULT_PW      = "sha256:b466dc50ab5cb0ee59b26e4b8ef1f1a060a7db501d509ba37a9086ee96df9bcb";


/* ─── HELPERS ───────────────────────────────────────────── */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function uid(prefix = "p") {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function escHtml(str) {
  return str == null ? "" : String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function showToast(msg, type = "") {
  const t = $("#dashToast");
  if (!t) return;
  t.textContent = msg;
  t.className = `dash-toast show${type ? " " + type : ""}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.className = "dash-toast", 2600);
}

/* ─── DATA LAYER ─────────────────────────────────────────── */
function loadProducts() {
  if (Array.isArray(window.ffProductCache)) return window.ffProductCache;
  if (window.ffSupabaseReady) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prods = raw ? JSON.parse(raw) : (typeof PRODUCTS !== "undefined" ? [...PRODUCTS] : []);
    return prods.map(p => ({
      stock: "in_stock",
      department: "All",
      ...p
    }));
  } catch { return []; }
}


function saveProducts(arr) {
  window.ffProductCache = arr;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn("Local storage write warning:", e);
  }

  if (window.ffSupabaseReady) {
    Promise.all(arr.map(async product => {
      const client = window.requireFfSupabase();
      const images = [product.image, ...(product.extraImages || [])].filter(Boolean);
      const { error } = await client.from("products").upsert({
        id: product.id, name: product.name, department: product.department || "All",
        category: product.category || "", subcategory: product.subcategory || "",
        price: Number(product.price) || 0, old_price: product.oldPrice == null ? null : Number(product.oldPrice),
        images, description: product.description || "", tag: product.tag || null,
        status: product.stock || "in_stock", track_stock: product.trackStock !== false,
        low_stock_threshold: product.lowStockThreshold ?? null, updated_at: new Date().toISOString()
      });
      if (error) throw error;

      const variants = [];
      const sizes = product.sizes && product.sizes.length ? product.sizes : [""];
      const colors = product.colors && product.colors.length ? product.colors : [""];
      sizes.forEach(size => colors.forEach(color => {
        const key = makeVariantKey(size, color);
        const rawId = product._variantIds?.[key];
        const isUUID = rawId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
        const vObj = {
          product_id: product.id,
          size: size || "",
          color: color || "",
          stock_quantity: Number(product.variantStock?.[key] || 0),
          updated_at: new Date().toISOString()
        };
        if (isUUID) vObj.id = rawId;
        variants.push(vObj);
      }));

      if (variants.length > 0) {
        const result = await client.from("product_variants").upsert(variants, { onConflict: "product_id,size,color" });
        if (result.error) throw result.error;
      }
    })).catch(error => {
      console.error("Supabase saveProducts error:", error);
      showToast(error.message || "Could not save product to cloud.", "error");
    });
  }
}

function loadCategories() {
  if (window.ffSettingsCache?.categories) return window.ffSettingsCache.categories;
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : (typeof DEFAULT_CATEGORIES !== "undefined" ? [...DEFAULT_CATEGORIES] : []);
  } catch { return []; }
}

function saveCategories(arr) {
  if (window.ffSupabaseReady) {
    window.ffSettingsCache = { ...(window.ffSettingsCache || {}), categories: arr };
    window.requireFfSupabase().from("settings").upsert({ key: "categories", value: arr, updated_at: new Date().toISOString() });
    return;
  }
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(arr));
}

function loadDepartments() {
  if (window.ffSettingsCache?.departments) return window.ffSettingsCache.departments;
  try {
    const raw = localStorage.getItem(DEPARTMENTS_KEY);
    let depts = raw ? JSON.parse(raw) : (typeof DEFAULT_DEPARTMENTS !== "undefined" ? [...DEFAULT_DEPARTMENTS] : [
      { id: "dept_all", name: "All items", slug: "all" },
      { id: "dept_men", name: "Men", slug: "Men" },
      { id: "dept_women", name: "Women", slug: "Women" },
      { id: "dept_home", name: "Home & Living", slug: "Home & Living" }
    ]);
    // Normalize any old "Home" to "Home & Living"
    return depts.map(d => {
      if (d.name === "Home" || d.slug === "Home") {
        return { ...d, name: "Home & Living", slug: "Home & Living" };
      }
      return d;
    });
  } catch { return []; }
}

function saveDepartments(arr) {
  if (window.ffSupabaseReady) {
    window.ffSettingsCache = { ...(window.ffSettingsCache || {}), departments: arr };
    window.requireFfSupabase().from("settings").upsert({ key: "departments", value: arr, updated_at: new Date().toISOString() });
    return;
  }
  localStorage.setItem(DEPARTMENTS_KEY, JSON.stringify(arr));
}


function loadSettings() {
  if (window.ffSettingsCache) return window.ffSettingsCache;
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        shopName:           parsed.shopName           || "Ferry & Fable",
        whatsapp:           parsed.whatsapp           || "+880 1700000000",
        currency:           parsed.currency           || "৳",
        deliveryNote:       parsed.deliveryNote       || "Delivery fee is confirmed at checkout based on your address.",
        lowStockThreshold:  typeof parsed.lowStockThreshold === "number" ? parsed.lowStockThreshold : (parseInt(parsed.lowStockThreshold) || 5),
        stockSystemEnabled: parsed.stockSystemEnabled !== false,
        logoUrl:            parsed.logoUrl            || ""
      };
    } catch {}
  }
  return {
    shopName: "Ferry & Fable",
    whatsapp: "+880 1700000000",
    currency: "৳",
    deliveryNote: "Delivery fee is confirmed at checkout based on your address.",
    lowStockThreshold: 5,
    stockSystemEnabled: true,
    logoUrl: ""
  };
}



function saveSettings(obj) {
  window.ffSettingsCache = obj;
  if (window.ffSupabaseReady) {
    window.requireFfSupabase().from("settings").upsert({ key: "storefront", value: obj, updated_at: new Date().toISOString() })
      .then(({ error }) => { if (error) showToast(error.message, "error"); });
    return;
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj));
}

function loadHero() {
  if (window.ffSettingsCache?.hero) return window.ffSettingsCache.hero;
  const raw = localStorage.getItem(HERO_KEY);
  return raw ? JSON.parse(raw) : {
    eyebrow: "No sign-up. No password. Just shopping.",
    title: "Things you actually\nneed, at prices that\nmake sense.",
    subtitle: "Browse the catalog, drop what you like into your bag, and check out in one message. Cash on delivery available across Bangladesh.",
    btn1: "Start browsing",
    btn2: "How ordering works",
    stat1Val: "500+", stat1Label: "orders delivered",
    stat2Val: "64",   stat2Label: "districts reached",
    stat3Val: "24h",  stat3Label: "order confirmation",
    sectionsEnabled: true,
    menSection: {
      title: "Men's Collection",
      subtitle: "Relaxed linen shirts, tailored chinos & everyday staples.",
      image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&q=80",
      btnText: "Explore Men →",
      categories: ["Shirts", "T-Shirts", "Pants", "Shoes", "Jackets"]
    },
    womenSection: {
      title: "Women's Collection",
      subtitle: "Flowy linen dresses, breathable poplin shirts & scarves.",
      image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800&q=80",
      btnText: "Explore Women →",
      categories: ["Dresses", "Tops", "Pants", "Scarves", "Bags"]
    }
  };
}

function saveHero(obj) {
  if (window.ffSupabaseReady) {
    window.ffSettingsCache = { ...(window.ffSettingsCache || {}), hero: obj };
    window.requireFfSupabase().from("settings").upsert({ key: "hero", value: obj, updated_at: new Date().toISOString() });
    return;
  }
  localStorage.setItem(HERO_KEY, JSON.stringify(obj));
}

function getStoredHash() { return localStorage.getItem(AUTH_KEY) || DEFAULT_PW; }

async function hashPassword(str) {
  if (window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(str + "_ff_secure_salt_2026");
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return "sha256:" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      console.warn("WebCrypto failed, falling back", e);
    }
  }
  return btoa(encodeURIComponent(str));
}

async function verifyPassword(inputPw, storedHash) {
  if (!storedHash || !inputPw) return false;
  if (storedHash.startsWith("sha256:")) {
    const computed = await hashPassword(inputPw);
    return computed === storedHash;
  }
  // Backwards compatibility for legacy btoa hashes
  return btoa(encodeURIComponent(inputPw)) === storedHash || btoa(inputPw) === storedHash;
}

/* ─── IMAGE COMPRESSION ──────────────────────────────────── */
function compressImage(file, maxPx = 800, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > maxPx || h > maxPx) {
          if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else        { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        const canvas = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function getColorHex(colorName) {
  const map = {
    white: "#FFFFFF", black: "#1B1D23", navy: "#14213D", blue: "#2980B9",
    "sky blue": "#70A1FF", grey: "#95A5A6", "charcoal grey": "#34495E",
    olive: "#556B2F", "sage green": "#8A9A86", green: "#27AE60",
    "forest green": "#1E5E3A", beige: "#E8D8C8", "sand beige": "#D6C4B0",
    khaki: "#C3B091", terracotta: "#C05A46", red: "#C0392B",
    burgundy: "#6B1D2F", maroon: "#800000", yellow: "#F1C40F",
    "butter yellow": "#FFF275", "natural ecru": "#F4EBD9", "matte black": "#222222",
    "ivory white": "#FAF0E6", "whiskey tan": "#A75D2B", "espresso brown": "#3D2314",
    oatmeal: "#DDD4C5", peach: "#FFCBA4", pink: "#FF69B4"
  };
  const key = String(colorName || "").toLowerCase().trim();
  return map[key] || "#888888";
}

/* ─── AUTH ───────────────────────────────────────────────── */
function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

async function initAuth() {
  const overlay = $("#loginOverlay");
  const shell   = $("#dashShell");

  // Configure login form appearance based on whether Supabase is active
  if (window.ffSupabaseReady) {
    // Show email field and update the subtitle to tell the admin what to enter
    const emailWrap = $("#loginEmailWrap");
    if (emailWrap) emailWrap.style.display = "block";
    const loginSub = $("#loginSub");
    if (loginSub) loginSub.textContent = "Sign in with your Supabase email and password.";
    const loginEmailInput = $("#loginEmail");
    if (loginEmailInput) loginEmailInput.required = true;
  }

  // If a session flag exists, verify it is still backed by a valid Supabase session
  // before bypassing the login form (prevents stale sessionStorage from granting access)
  if (isLoggedIn()) {
    if (window.ffSupabaseReady) {
      try {
        const { data: { session } } = await window.requireFfSupabase().auth.getSession();
        if (session) {
          window.ffAuthSession = session;
          overlay.style.display = "none";
          shell.style.display   = "grid";
          try { await prepareSupabaseDashboard(); } catch (e) {}
          setupDashboard();
          return;
        }
        // Session has expired or was never established via Supabase — force re-login
        sessionStorage.removeItem(SESSION_KEY);
        // Fall through to show login form
      } catch (e) {
        // Cannot reach Supabase to verify — proceed with the existing session cookie
        overlay.style.display = "none";
        shell.style.display   = "grid";
        try { await prepareSupabaseDashboard(); } catch (e) {}
        setupDashboard();
        return;
      }
    } else {
      // Local-only mode — the session flag alone is sufficient
      overlay.style.display = "none";
      shell.style.display   = "grid";
      setupDashboard();
      return;
    }
  }

  // ── Login form submission handler ─────────────────────────
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const pw    = ($("#loginPassword")?.value || "").trim();
    const email = ($("#loginEmail")?.value || "").trim();

    if (window.ffSupabaseReady) {
      // SUPABASE MODE — require a real Supabase Auth session.
      // The local password hash is intentionally bypassed when Supabase is configured
      // so that RLS-protected writes cannot be performed without a valid JWT.
      if (!email) {
        $("#loginError").textContent = "Please enter your email address to sign in.";
        $("#loginEmail")?.focus();
        return;
      }
      try {
        const { data, error } = await window.requireFfSupabase().auth.signInWithPassword({ email, password: pw });
        if (!error && data?.session) {
          window.ffAuthSession = data.session;
          sessionStorage.setItem(SESSION_KEY, "1");
          overlay.style.display = "none";
          shell.style.display   = "grid";
          $("#loginError").textContent = "";
          await prepareSupabaseDashboard();
          setupDashboard();
          return;
        }
        // Supabase sign-in failed — show a clear, actionable error message
        $("#loginError").textContent =
          (error?.message === "Invalid login credentials")
            ? "Incorrect email or password. Please try again."
            : (error?.message || "Sign-in failed. Please check your credentials.");
      } catch (authErr) {
        $("#loginError").textContent = "Could not reach Supabase. Check your internet connection and try again.";
      }
      $("#loginPassword").value = "";
      $("#loginPassword").focus();
      return; // ← Never fall through to local-password check in Supabase mode
    }

    // LOCAL-ONLY MODE — Supabase is not configured; use the local password hash.
    // This path preserves the zero-setup experience described in CLIENT_HANDOVER_GUIDE.md.
    const isCorrect = await verifyPassword(pw, getStoredHash());
    if (isCorrect) {
      sessionStorage.setItem(SESSION_KEY, "1");
      overlay.style.display = "none";
      shell.style.display   = "grid";
      $("#loginError").textContent = "";
      setupDashboard();
      return;
    }

    $("#loginError").textContent = "Incorrect password. Please try again.";
    $("#loginPassword").value = "";
    $("#loginPassword").focus();
  });

  $("#logoutBtn").addEventListener("click", () => {
    if (window.ffSupabaseReady && window.ffSupabase) {
      try { window.requireFfSupabase().auth.signOut(); } catch (e) {}
    }
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });
}

async function prepareSupabaseDashboard() {
  window.ffProductCache = await window.ffLoadCatalog();
  window.ffSettingsCache = await window.ffLoadSettings();
  const { data, error } = await window.requireFfSupabase().from("orders").select("*, order_items(*)").order("created_at", { ascending: false });
  if (error) throw error;
  window.ffOrdersCache = (data || []).map(order => ({
    id: order.order_number, databaseId: order.id, date: order.created_at,
    customer: { name: order.customer_name, phone: order.customer_phone, address: order.customer_address },
    total: Number(order.total), status: order.status, paymentStatus: order.payment_status,
    items: (order.order_items || []).map(item => ({ id: item.product_id, name: item.product_name, size: item.size, color: item.color, qty: item.quantity, price: Number(item.unit_price) }))
  }));
  window.ffSubscribe(async () => {
    await prepareSupabaseDashboard();
    if (currentView === "orders") renderOrdersView();
    renderOverview();
  }, async () => {
    await prepareSupabaseDashboard();
    renderOrdersView();
  });
}

/* ─── NAVIGATION ─────────────────────────────────────────── */
let currentView = "products";

function showView(name) {
  currentView = name;
  $$(".view").forEach(v => v.style.display = "none");
  const target = $(`#view${name[0].toUpperCase() + name.slice(1)}`);
  if (target) target.style.display = "block";
  $$(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.view === name));
  closeSidebar();

  if (name === "overview")   renderOverview();
  if (name === "products")   renderProductsTable();
  if (name === "categories") {
    renderDepartmentsTable();
    renderCategoriesTable();
  }
  if (name === "hero")     initHeroEditor();
  if (name === "settings") { reloadSettingsFields(); renderStorageBar(); }
  if (name === "orders")   renderOrdersView();
}

/* reload settings form with latest saved values */
function reloadSettingsFields() {
  const s = loadSettings();
  if ($("#sShopName"))          $("#sShopName").value          = s.shopName          || "";
  if ($("#sWhatsapp"))          $("#sWhatsapp").value          = s.whatsapp          || "";
  if ($("#sCurrency"))          $("#sCurrency").value          = s.currency          || "";
  if ($("#sDeliveryNote"))      $("#sDeliveryNote").value      = s.deliveryNote      || "";
  if ($("#sLowStockThreshold")) $("#sLowStockThreshold").value = s.lowStockThreshold || "5";
  if (typeof updateStockSystemMasterUI === "function") {
    updateStockSystemMasterUI(s.stockSystemEnabled !== false);
  }
  if (s.logoUrl && $("#logoDashPreview") && $("#logoPreviewWrap") && $("#logoUploadInner")) {
    $("#logoDashPreview").src = s.logoUrl;
    $("#logoPreviewWrap").style.display = "flex";
    $("#logoUploadInner").style.display = "none";
  } else if (!s.logoUrl && $("#logoPreviewWrap") && $("#logoUploadInner")) {
    $("#logoPreviewWrap").style.display = "none";
    $("#logoUploadInner").style.display = "";
  }
}


/* ─── ORDERS VIEW ────────────────────────────────────────── */
const ORDERS_KEY_DASH = "ff_orders";

function loadOrdersDash() {
  if (window.ffOrdersCache) return window.ffOrdersCache;
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY_DASH) || "[]"); } catch { return []; }
}
function saveOrdersDash(arr) {
  window.ffOrdersCache = arr;
  if (window.ffSupabaseReady) {
    Promise.all(arr.map(order => window.requireFfSupabase().from("orders").update({ status: order.status, payment_status: order.paymentStatus || "unpaid", updated_at: new Date().toISOString() }).eq("order_number", order.id)))
      .catch(error => showToast(error.message || "Could not save order.", "error"));
    return;
  }
  localStorage.setItem(ORDERS_KEY_DASH, JSON.stringify(arr));
}

const ORDER_STATUS_COLORS = {
  pending:   { bg: "#fef3c7", text: "#92400e", label: "Pending" },
  confirmed: { bg: "#dbeafe", text: "#1e40af", label: "Confirmed" },
  shipped:   { bg: "#ede9fe", text: "#5b21b6", label: "Shipped" },
  delivered: { bg: "#d1fae5", text: "#065f46", label: "Delivered" },
  cancelled: { bg: "#fee2e2", text: "#991b1b", label: "Cancelled" }
};



/* Dashboard PDF proof generator helper */
function generateRawPdfBlobDash(order, settings) {
  const shopName = (settings && settings.shopName) || "Ferry & Fable";
  const shopPhone = (settings && settings.whatsapp) || "+880 1700000000";
  const orderId = order.id || "ORD-" + Date.now();
  const dObj = new Date(order.date || Date.now());
  const dateStr = dObj.toLocaleDateString("en-BD", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = dObj.toLocaleTimeString("en-BD", { hour: "2-digit", minute: "2-digit" });

  const cust = order.customer || {};
  const custName = cust.name || "Customer";
  const custPhone = cust.phone || "—";
  const custAddress = cust.address || "—";
  const payment = order.payment || "Cash on Delivery";
  const total = order.total || 0;
  const isPaid = order.paymentStatus === "paid" || order.isPaid === true;

  function cleanStr(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, " ");
  }

  let stream = "";
  // Header Box (Brand Navy 20, 33, 61 -> 0.08 0.13 0.24)
  stream += "0.08 0.13 0.24 rg\n";
  stream += "40 735 515 75 re f\n";
  // Gold bottom accent line (250, 204, 21 -> 0.98 0.80 0.08)
  stream += "0.98 0.80 0.08 rg\n";
  stream += "40 735 515 3 re f\n";

  // Logo: Ferry (White) & (Gold) Fable (White)
  stream += "1 1 1 rg\n";
  stream += "BT /F1 20 Tf 55 772 Td (Ferry) Tj ET\n";
  stream += "0.98 0.80 0.08 rg\n";
  stream += "BT /F1 20 Tf 105 772 Td (&) Tj ET\n";
  stream += "1 1 1 rg\n";
  stream += "BT /F1 20 Tf 125 772 Td (Fable) Tj ET\n";

  // Subtitle tag
  stream += "0.98 0.80 0.08 rg\n";
  stream += "BT /F1 7.5 Tf 55 752 Td (EVERYDAY ESSENTIALS - OFFICIAL INVOICE) Tj ET\n";

  // Right Header ID & Status
  stream += "1 1 1 rg\n";
  stream += "BT /F1 11 Tf 400 772 Td (INVOICE #" + cleanStr(orderId).slice(0, 18) + ") Tj ET\n";
  if (isPaid) {
    stream += "0.65 0.95 0.81 rg\n";
    stream += "BT /F1 9 Tf 400 752 Td (STATUS: PAID) Tj ET\n";
  } else {
    stream += "0.98 0.80 0.08 rg\n";
    stream += "BT /F1 8.5 Tf 400 752 Td (STATUS: PENDING) Tj ET\n";
  }

  // Customer Details & Order Summary Box
  stream += "0.97 0.98 0.99 rg\n";
  stream += "40 630 515 93 re f\n";
  stream += "0.88 0.90 0.94 RG 1 w\n";
  stream += "40 630 515 93 re S\n";

  stream += "0.08 0.13 0.24 rg\n";
  stream += "BT /F1 9.5 Tf 55 706 Td (DELIVER TO - CUSTOMER INFO) Tj ET\n";
  stream += "BT /F1 9.5 Tf 320 706 Td (ORDER & PAYMENT DETAILS) Tj ET\n";
  stream += "0.98 0.80 0.08 rg\n";
  stream += "55 702 40 1.5 re f\n";
  stream += "320 702 40 1.5 re f\n";

  stream += "0.08 0.13 0.24 rg\n";
  stream += "BT /F1 10 Tf 55 688 Td (" + cleanStr(custName).slice(0, 36) + ") Tj ET\n";
  stream += "0.30 0.35 0.45 rg\n";
  stream += "BT /F2 8.5 Tf 55 673 Td (Phone: " + cleanStr(custPhone).slice(0, 24) + ") Tj ET\n";
  stream += "BT /F2 8.5 Tf 55 658 Td (Address: " + cleanStr(custAddress).slice(0, 42) + ") Tj ET\n";
  if (custAddress.length > 42) {
    stream += "BT /F2 8.5 Tf 55 645 Td (" + cleanStr(custAddress).slice(42, 84) + ") Tj ET\n";
  }

  stream += "BT /F2 8.5 Tf 320 688 Td (Date: " + cleanStr(dateStr) + " at " + cleanStr(timeStr) + ") Tj ET\n";
  stream += "BT /F2 8.5 Tf 320 673 Td (Payment Method: " + cleanStr(payment).slice(0, 28) + ") Tj ET\n";
  if (isPaid) {
    stream += "0.02 0.37 0.27 rg\n";
    stream += "BT /F1 9 Tf 320 658 Td (Payment Status: PAID) Tj ET\n";
  } else {
    stream += "0.75 0.40 0.05 rg\n";
    stream += "BT /F1 9 Tf 320 658 Td (Payment Status: UNPAID - COD) Tj ET\n";
  }
  stream += "0.30 0.35 0.45 rg\n";
  stream += "BT /F2 8.5 Tf 320 645 Td (Shop WhatsApp: " + cleanStr(shopPhone) + ") Tj ET\n";

  // Table Header (Navy + Gold Line)
  stream += "0.08 0.13 0.24 rg\n";
  stream += "40 595 515 24 re f\n";
  stream += "0.98 0.80 0.08 rg\n";
  stream += "40 595 515 2 re f\n";
  stream += "1 1 1 rg\n";
  stream += "BT /F1 8.5 Tf 50 603 Td (#) Tj ET\n";
  stream += "BT /F1 8.5 Tf 75 603 Td (ITEM DESCRIPTION & SPECIFICATIONS) Tj ET\n";
  stream += "BT /F1 8.5 Tf 360 603 Td (QTY) Tj ET\n";
  stream += "BT /F1 8.5 Tf 420 603 Td (PRICE) Tj ET\n";
  stream += "BT /F1 8.5 Tf 490 603 Td (TOTAL) Tj ET\n";

  let curY = 575;
  (order.items || []).forEach((it, idx) => {
    const varParts = [it.size ? `Size: ${it.size}` : "", it.color ? `Color: ${it.color}` : ""].filter(Boolean);
    const varTxt = varParts.length ? ` (${varParts.join(", ")})` : "";
    const itemTitle = cleanStr(it.name + varTxt);

    if (idx % 2 === 1) {
      stream += "0.97 0.98 0.99 rg\n";
      stream += "40 " + (curY - 6) + " 515 20 re f\n";
    }
    stream += "0.93 0.95 0.97 RG 0.5 w\n";
    stream += "40 " + (curY - 6) + " 515 0.5 re S\n";

    stream += "0.45 0.50 0.55 rg\n";
    stream += "BT /F1 8 Tf 50 " + curY + " Td (" + (idx + 1) + ") Tj ET\n";
    stream += "0.08 0.13 0.24 rg\n";
    stream += "BT /F2 8.5 Tf 75 " + curY + " Td (" + itemTitle.slice(0, 44) + ") Tj ET\n";
    stream += "0.30 0.35 0.45 rg\n";
    stream += "BT /F2 8.5 Tf 365 " + curY + " Td (x" + it.qty + ") Tj ET\n";
    stream += "BT /F2 8.5 Tf 420 " + curY + " Td (Tk " + Number(it.price).toLocaleString() + ") Tj ET\n";
    stream += "0.08 0.13 0.24 rg\n";
    stream += "BT /F1 8.5 Tf 490 " + curY + " Td (Tk " + (Number(it.price) * it.qty).toLocaleString() + ") Tj ET\n";

    curY -= 20;
  });

  // Payable Box
  curY -= 8;
  if (isPaid) {
    stream += "0.02 0.37 0.27 rg\n";
    stream += "345 " + (curY - 14) + " 210 38 re f\n";
    stream += "0.98 0.80 0.08 RG 1 w\n";
    stream += "345 " + (curY - 14) + " 210 38 re S\n";
    stream += "1 1 1 rg\n";
    stream += "BT /F1 9.5 Tf 355 " + (curY + 6) + " Td (TOTAL PAYABLE: Tk " + Number(total).toLocaleString() + ") Tj ET\n";
    stream += "0.98 0.80 0.08 rg\n";
    stream += "BT /F1 10.5 Tf 355 " + (curY - 8) + " Td (PAID) Tj ET\n";
  } else {
    stream += "0.08 0.13 0.24 rg\n";
    stream += "345 " + (curY - 14) + " 210 38 re f\n";
    stream += "0.98 0.80 0.08 RG 1 w\n";
    stream += "345 " + (curY - 14) + " 210 38 re S\n";
    stream += "1 1 1 rg\n";
    stream += "BT /F1 10 Tf 355 " + (curY + 6) + " Td (TOTAL PAYABLE: Tk " + Number(total).toLocaleString() + ") Tj ET\n";
    stream += "0.98 0.80 0.08 rg\n";
    stream += "BT /F1 9 Tf 355 " + (curY - 8) + " Td (PAYABLE UPON DELIVERY - COD) Tj ET\n";
  }

  // Customer Guarantee Box (Gold Tinted Card)
  curY -= 65;
  stream += "0.99 0.98 0.96 rg\n";
  stream += "40 " + (curY - 25) + " 515 72 re f\n";
  stream += "0.98 0.80 0.08 RG 1 w\n";
  stream += "40 " + (curY - 25) + " 515 72 re S\n";

  stream += "0.75 0.40 0.05 rg\n";
  stream += "BT /F1 9.5 Tf 55 " + (curY + 28) + " Td (OFFICIAL ORDER PROOF & STORE GUARANTEE) Tj ET\n";
  stream += "0.25 0.30 0.35 rg\n";
  stream += "BT /F2 8.5 Tf 55 " + (curY + 12) + " Td (This document is legal proof of order submission with " + cleanStr(shopName) + ".) Tj ET\n";
  if (isPaid) {
    stream += "0.02 0.37 0.27 rg\n";
    stream += "BT /F1 8.5 Tf 55 " + (curY - 2) + " Td (PAYMENT CONFIRMED: Customer has paid the amount of Tk " + Number(total).toLocaleString() + ".) Tj ET\n";
  } else {
    stream += "BT /F2 8.5 Tf 55 " + (curY - 2) + " Td (If customer has inquiries or delivery delay, verify using Order ID #" + cleanStr(orderId) + ") Tj ET\n";
  }
  stream += "0.25 0.30 0.35 rg\n";
  stream += "BT /F2 8.5 Tf 55 " + (curY - 16) + " Td (Store WhatsApp Support: " + cleanStr(shopPhone) + ") Tj ET\n";

  // Footer note
  stream += "0.60 0.65 0.70 rg\n";
  stream += "BT /F2 7.5 Tf 145 30 Td (" + cleanStr(shopName) + " - Everyday Essentials - WhatsApp: " + cleanStr(shopPhone) + " - Ref #" + cleanStr(orderId) + ") Tj ET\n";

  const streamLen = stream.length;
  const pdf =
`%PDF-1.4
1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj
2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj
3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj
4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj
5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj
6 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj
xref\n0 7\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000244 00000 n \n0000000325 00000 n \n0000000399 00000 n \ntrailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${400 + streamLen + 50}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function downloadOrderPdfDash(order, settings) {
  const s = settings || loadSettings();
  const shopName = s.shopName || "Ferry & Fable";
  const shopPhone = s.whatsapp || "+880 1700000000";
  const orderId = order.id || ("ORD-" + Date.now());
  const dObj = new Date(order.date || Date.now());
  const dateStr = dObj.toLocaleDateString("en-BD", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = dObj.toLocaleTimeString("en-BD", { hour: "2-digit", minute: "2-digit" });

  const isPaid = order.paymentStatus === "paid" || order.isPaid === true;
  const items = order.items || [];
  const total = order.total || 0;
  const cust = order.customer || {};

  let blob = null;
  if (window.jspdf && window.jspdf.jsPDF) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pw = 595.28;
      let y = 35;

      // ─── BRAND HEADER BANNER (DEEP NAVY #14213d) ───
      doc.setFillColor(20, 33, 61); // Signature Deep Navy
      doc.rect(40, y, pw - 80, 75, "F");

      // Gold bottom accent line (3pt)
      doc.setFillColor(250, 204, 21); // #facc15 Vibrant Gold
      doc.rect(40, y + 72, pw - 80, 3, "F");

      // Brand Logo in Header: "Ferry" (White) + " & " (Gold) + "Fable" (White)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      doc.text("Ferry", 55, y + 36);

      const fW = doc.getTextWidth("Ferry ");
      doc.setTextColor(250, 204, 21); // Gold yellow
      doc.setFont("helvetica", "bolditalic");
      doc.text("&", 55 + fW, y + 36);

      const aW = doc.getTextWidth("& ");
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("Fable", 55 + fW + aW, y + 36);

      // Subtitle brand tag matching logo: "EVERYDAY ESSENTIALS · OFFICIAL INVOICE"
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(250, 204, 21);
      doc.text("E V E R Y D A Y   E S S E N T I A L S   ·   O F F I C I A L   I N V O I C E", 55, y + 56);

      // Header Right: Invoice ID & Status Badge
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`INVOICE #${orderId}`, pw - 55, y + 32, { align: "right" });

      if (isPaid) {
        doc.setFillColor(6, 95, 70); // Emerald green
        doc.roundedRect(pw - 130, y + 42, 75, 20, 3, 3, "F");
        doc.setTextColor(167, 243, 208);
        doc.setFontSize(8.5);
        doc.text("PAID", pw - 92, y + 55, { align: "center" });
      } else {
        doc.setFillColor(30, 48, 85); // Navy slate
        doc.roundedRect(pw - 170, y + 42, 115, 20, 3, 3, "F");
        doc.setTextColor(250, 204, 21);
        doc.setFontSize(8);
        doc.text("PENDING · COD", pw - 112, y + 55, { align: "center" });
      }

      y += 92;

      // ─── INFO CARDS (DELIVER TO & ORDER SUMMARY) ───
      const colW = (pw - 90) / 2;
      const splitAddr = doc.splitTextToSize(`Address: ${cust.address || "—"}`, colW - 24);
      const cardH = Math.max(92, 54 + (splitAddr.length * 13));

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(40, y, colW, cardH, 4, 4, "FD");
      doc.roundedRect(40 + colW + 10, y, colW, cardH, 4, 4, "FD");

      // Left: Customer info
      doc.setTextColor(20, 33, 61);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.text("DELIVER TO (CUSTOMER)", 54, y + 18);
      doc.setFillColor(250, 204, 21);
      doc.rect(54, y + 22, 40, 1.5, "F");

      doc.setTextColor(20, 33, 61);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(doc.splitTextToSize(cust.name || "Customer", colW - 28)[0] || (cust.name || "Customer"), 54, y + 38);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Phone: ${cust.phone || "—"}`, 54, y + 52);
      doc.text(splitAddr, 54, y + 66);

      // Right: Order Details
      const b2x = 40 + colW + 22;
      doc.setTextColor(20, 33, 61);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.text("ORDER & PAYMENT DETAILS", b2x, y + 18);
      doc.setFillColor(250, 204, 21);
      doc.rect(b2x, y + 22, 40, 1.5, "F");

      doc.setTextColor(71, 85, 105);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(`Date & Time: ${dateStr} at ${timeStr}`, b2x, y + 38);
      doc.text(`Payment Method: ${order.payment || "Cash on Delivery"}`, b2x, y + 52);

      doc.setFont("helvetica", "bold");
      if (isPaid) {
        doc.setTextColor(6, 95, 70);
        doc.text("Payment Status: PAID", b2x, y + 66);
      } else {
        doc.setTextColor(180, 83, 9);
        doc.text("Payment Status: UNPAID (COD)", b2x, y + 66);
      }
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`WhatsApp Support: ${shopPhone}`, b2x, y + 80);

      y += cardH + 16;

      // ─── ITEM TABLE HEADER (NAVY + GOLD STRIPE) ───
      doc.setFillColor(20, 33, 61);
      doc.rect(40, y, pw - 80, 24, "F");
      doc.setFillColor(250, 204, 21);
      doc.rect(40, y + 23, pw - 80, 1.5, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("#", 52, y + 16);
      doc.text("ITEM DESCRIPTION & SPECIFICATIONS", 75, y + 16);
      doc.text("QTY", pw - 180, y + 16, { align: "right" });
      doc.text("UNIT PRICE", pw - 110, y + 16, { align: "right" });
      doc.text("TOTAL", pw - 55, y + 16, { align: "right" });

      y += 25;

      // ─── ITEM ROWS ───
      items.forEach((it, idx) => {
        const isEven = idx % 2 === 0;
        doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
        doc.rect(40, y, pw - 80, 24, "F");

        doc.setDrawColor(241, 245, 249);
        doc.line(40, y + 24, pw - 40, y + 24);

        doc.setTextColor(100, 116, 139);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text(String(idx + 1), 52, y + 16);

        const varArr = [it.size ? `Size: ${it.size}` : "", it.color ? `Color: ${it.color}` : ""].filter(Boolean);
        const varTxt = varArr.length ? ` (${varArr.join(", ")})` : "";
        const itemDesc = `${it.name}${varTxt}`;

        doc.setTextColor(20, 33, 61);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(doc.splitTextToSize(itemDesc, pw - 275)[0] || itemDesc, 75, y + 16);

        doc.text(`x${it.qty}`, pw - 180, y + 16, { align: "right" });
        doc.text(`Tk ${Number(it.price).toLocaleString()}`, pw - 110, y + 16, { align: "right" });

        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 33, 61);
        doc.text(`Tk ${(Number(it.price) * it.qty).toLocaleString()}`, pw - 55, y + 16, { align: "right" });

        y += 24;
      });

      y += 12;

      // ─── TOTALS SECTION ───
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("Delivery Charges:", pw - 250, y + 14);
      doc.setTextColor(6, 95, 70);
      doc.setFont("helvetica", "bold");
      doc.text("FREE / INCLUDED", pw - 55, y + 14, { align: "right" });

      y += 22;

      // TOTAL PAYABLE BOX
      if (isPaid) {
        doc.setFillColor(6, 95, 70);
        doc.setDrawColor(250, 204, 21);
        doc.roundedRect(pw - 250, y, 210, 44, 4, 4, "FD");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.text("TOTAL PAYABLE:", pw - 235, y + 18);
        doc.setFontSize(13);
        doc.text(`Tk ${Number(total).toLocaleString()}`, pw - 55, y + 18, { align: "right" });
        doc.setTextColor(250, 204, 21);
        doc.setFontSize(9.5);
        doc.text("PAID", pw - 235, y + 34);
      } else {
        doc.setFillColor(20, 33, 61);
        doc.setDrawColor(250, 204, 21);
        doc.roundedRect(pw - 250, y, 210, 44, 4, 4, "FD");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.text("TOTAL PAYABLE:", pw - 235, y + 18);
        doc.setFontSize(13);
        doc.text(`Tk ${Number(total).toLocaleString()}`, pw - 55, y + 18, { align: "right" });
        doc.setTextColor(250, 204, 21);
        doc.setFontSize(8.5);
        doc.text("PAYABLE ON DELIVERY (COD)", pw - 235, y + 34);
      }

      y += 56;

      // ─── STORE GUARANTEE ───
      doc.setFillColor(254, 252, 247);
      doc.setDrawColor(250, 204, 21);
      doc.roundedRect(40, y, pw - 80, 64, 5, 5, "FD");
      doc.setTextColor(180, 83, 9);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.text("★ OFFICIAL ORDER PROOF & STORE GUARANTEE", 55, y + 17);
      doc.setTextColor(71, 85, 105);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(`This document is official legal proof of order submission with ${shopName}.`, 55, y + 31);

      if (isPaid) {
        doc.setTextColor(6, 95, 70);
        doc.setFont("helvetica", "bold");
        doc.text(`PAYMENT CONFIRMED: Tk ${Number(total).toLocaleString()} received.`, 55, y + 45);
      } else {
        const guaranteeTxt = `If customer has inquiries, verify using Order ID #${orderId} on WhatsApp (${shopPhone}).`;
        doc.text(doc.splitTextToSize(guaranteeTxt, pw - 110)[0] || guaranteeTxt, 55, y + 45);
      }

      doc.setDrawColor(226, 232, 240);
      doc.line(40, 785, pw - 40, 785);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(7.5);
      doc.text(`${shopName} • Everyday Essentials • WhatsApp: ${shopPhone}`, pw / 2, 798, { align: "center" });
      blob = doc.output("blob");
    } catch(e) {
      console.warn("jsPDF dash error:", e);
    }
  }


  if (!blob) blob = generateRawPdfBlobDash(order, s);

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Order-Proof-${orderId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  showToast("📄 Order PDF proof downloaded!", "success");
}

function renderOrdersView() {
  const allOrders = loadOrdersDash();
  const filterVal = ($("#orderStatusFilter") ? $("#orderStatusFilter").value : "").toLowerCase();
  const paymentFilterVal = ($("#orderPaymentFilter") ? $("#orderPaymentFilter").value : "").toLowerCase();
  const searchVal = ($("#orderSearchInput") ? $("#orderSearchInput").value : "").trim().toLowerCase();

  let orders = allOrders;
  if (filterVal) orders = orders.filter(o => o.status === filterVal);
  if (paymentFilterVal === "paid") {
    orders = orders.filter(o => o.paymentStatus === "paid" || o.isPaid === true);
  } else if (paymentFilterVal === "unpaid") {
    orders = orders.filter(o => !(o.paymentStatus === "paid" || o.isPaid === true));
  }

  if (searchVal) {
    orders = orders.filter(o => {
      const idMatch   = (o.id || "").toLowerCase().includes(searchVal);
      const nameMatch = (o.customer?.name || "").toLowerCase().includes(searchVal);
      const phoneMatch= (o.customer?.phone || "").toLowerCase().includes(searchVal);
      const addrMatch = (o.customer?.address || "").toLowerCase().includes(searchVal);
      return idMatch || nameMatch || phoneMatch || addrMatch;
    });
  }

  const countSub = $("#ordersCountSub");
  if (countSub) countSub.textContent = `${allOrders.length} total web order${allOrders.length !== 1 ? "s" : ""} • ${allOrders.filter(o => o.status === "pending").length} pending • ${allOrders.filter(o => o.paymentStatus === "paid" || o.isPaid === true).length} paid${searchVal ? ` (${orders.length} found)` : ""}`;

  const grid = $("#ordersCardGrid");
  const empty = $("#emptyOrders");

  if (!orders.length) {
    if (grid) grid.innerHTML = "";
    if (empty) {
      empty.hidden = false;
      empty.textContent = searchVal
        ? `No orders matching "${searchVal}".`
        : "No web orders yet. Orders submitted directly from the storefront will appear here.";
    }
    return;
  }
  if (empty) empty.hidden = true;

  grid.innerHTML = orders.map(order => {
    const d = new Date(order.date);
    const dateStr = d.toLocaleDateString("en-BD", { day: "2-digit", month: "short", year: "numeric" });
    const timeStr = d.toLocaleTimeString("en-BD", { hour: "2-digit", minute: "2-digit" });
    const sc = ORDER_STATUS_COLORS[order.status] || ORDER_STATUS_COLORS.pending;
    const isPaid = order.paymentStatus === "paid" || order.isPaid === true;

    const itemsHtml = (order.items || []).map(it => {
      const varParts = [it.size ? `Size: ${it.size}` : "", it.color ? `Color: ${it.color}` : ""].filter(Boolean);
      return `<div class="order-item-row">
        <span class="oi-name">${escHtml(it.name)}${varParts.length ? ` <span class="oi-var">(${escHtml(varParts.join(", "))})</span>` : ""} ×${it.qty}</span>
        <span class="oi-price">৳${(it.price * it.qty).toLocaleString()}</span>
      </div>`;
    }).join("");

    const statusOptions = Object.entries(ORDER_STATUS_COLORS).map(([val, info]) =>
      `<option value="${val}" ${order.status === val ? "selected" : ""}>${info.label}</option>`
    ).join("");

    return `<div class="order-card" data-order-id="${escHtml(order.id)}">
      <div class="order-card-head">
        <div class="order-meta">
          <strong class="order-id">#${escHtml(order.id)}</strong>
          <span class="order-date">${dateStr} at ${timeStr}</span>
        </div>
        <div class="order-card-actions">
          <span class="order-status-badge" style="background:${sc.bg};color:${sc.text}">${sc.label}</span>
          <select class="order-status-select table-filter" data-order-id="${escHtml(order.id)}" title="Change order status">
            ${statusOptions}
          </select>
          <select class="order-payment-select table-filter ${isPaid ? 'is-paid' : 'is-unpaid'}" data-order-id="${escHtml(order.id)}" title="Change payment status">
            <option value="unpaid" ${!isPaid ? 'selected' : ''}>⏳ Unpaid</option>
            <option value="paid" ${isPaid ? 'selected' : ''}>✅ Paid</option>
          </select>
          <button class="btn btn-ghost btn-sm order-delete-btn" data-order-id="${escHtml(order.id)}" title="Delete order">✕</button>
        </div>
      </div>
      <div class="order-customer-row">
        <div><strong>${escHtml(order.customer.name)}</strong> · 📞 ${escHtml(order.customer.phone)}</div>
        <div class="order-address">📍 ${escHtml(order.customer.address)}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
          <span>💳 ${escHtml(order.payment || 'Cash on Delivery')}</span>
          <span class="order-paid-pill ${isPaid ? 'paid' : 'unpaid'}">${isPaid ? '✅ Paid' : '⏳ Payment Due'}</span>
        </div>
      </div>
      <div class="order-items-box">${itemsHtml}</div>
      <div class="order-total-line">
        <span>Total</span><strong>৳${(order.total || 0).toLocaleString()}</strong>
      </div>
      <div class="order-card-foot-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost btn-sm order-pdf-btn" data-order-id="${escHtml(order.id)}" style="border:1px solid var(--line);font-size:.78rem;font-weight:600">⬇️ Download PDF Proof</button>
        <button type="button" class="btn btn-ghost btn-sm order-wa-btn" data-order-id="${escHtml(order.id)}" style="border:1px solid #25d366;color:#128c7e;font-size:.78rem;font-weight:600">💬 WhatsApp Customer</button>
      </div>
    </div>`;
  }).join("");

  // Status change
  grid.querySelectorAll(".order-status-select").forEach(sel => {
    sel.onchange = () => {
      const oid = sel.dataset.orderId;
      const all = loadOrdersDash();
      const idx = all.findIndex(o => o.id === oid);
      if (idx >= 0) {
        const prevStatus = all[idx].status;
        const newStatus = sel.value;
        // ── AUTO STOCK DEDUCTION / RESERVATION RELEASE ─────────
        if (typeof handleOrderStatusStockTransition === "function") {
          handleOrderStatusStockTransition(all[idx], prevStatus, newStatus, "Admin");
          // Persist updated product stock
          const prods = JSON.parse(localStorage.getItem("ff_products") || "[]");
          localStorage.setItem("ff_products", JSON.stringify(prods));
        }
        // ──────────────────────────────────────────────────────
        all[idx].status = newStatus;
        saveOrdersDash(all);
        renderOrdersView();
        showToast(`Order #${oid} → ${ORDER_STATUS_COLORS[sel.value]?.label || sel.value} ✓`, "success");
      }
    };
  });

  // Payment status change (Unpaid <-> Paid)
  grid.querySelectorAll(".order-payment-select").forEach(sel => {
    sel.onchange = () => {
      const oid = sel.dataset.orderId;
      const all = loadOrdersDash();
      const idx = all.findIndex(o => o.id === oid);
      if (idx >= 0) {
        all[idx].paymentStatus = sel.value;
        all[idx].isPaid = (sel.value === "paid");
        saveOrdersDash(all);
        renderOrdersView();
        showToast(`Order #${oid} payment marked as ${sel.value === 'paid' ? 'PAID ✅' : 'UNPAID ⏳'}`, "success");
      }
    };
  });

  // Download PDF Proof button
  grid.querySelectorAll(".order-pdf-btn").forEach(btn => {
    btn.onclick = () => {
      const oid = btn.dataset.orderId;
      const o = loadOrdersDash().find(x => x.id === oid);
      if (o) downloadOrderPdfDash(o, loadSettings());
    };
  });

  // WhatsApp Customer button
  grid.querySelectorAll(".order-wa-btn").forEach(btn => {
    btn.onclick = () => {
      const oid = btn.dataset.orderId;
      const o = loadOrdersDash().find(x => x.id === oid);
      if (!o) return;
      let rawPhone = (o.customer?.phone || "").replace(/\D/g, "");
      if (rawPhone.startsWith("0")) rawPhone = "88" + rawPhone;
      const msg = `Hello ${o.customer?.name}, this is Ferry & Fable regarding your order #${o.id}. We have your order details and are checking your delivery status!`;
      window.open(`https://wa.me/${rawPhone}?text=${encodeURIComponent(msg)}`, "_blank");
    };
  });

  // Delete individual
  grid.querySelectorAll(".order-delete-btn").forEach(btn => {
    btn.onclick = () => {
      if (!confirm("Delete this order? This cannot be undone.")) return;
      const oid = btn.dataset.orderId;
      saveOrdersDash(loadOrdersDash().filter(o => o.id !== oid));
      renderOrdersView();
      showToast("Order deleted.", "success");
    };
  });

  // Status filter change
  if ($("#orderStatusFilter") && !$("#orderStatusFilter")._wired) {
    $("#orderStatusFilter")._wired = true;
    $("#orderStatusFilter").onchange = renderOrdersView;
  }

  // Payment filter change
  if ($("#orderPaymentFilter") && !$("#orderPaymentFilter")._wired) {
    $("#orderPaymentFilter")._wired = true;
    $("#orderPaymentFilter").onchange = renderOrdersView;
  }

  // Order search input
  if ($("#orderSearchInput") && !$("#orderSearchInput")._wired) {
    $("#orderSearchInput")._wired = true;
    $("#orderSearchInput").addEventListener("input", renderOrdersView);
  }


  // Clear all orders
  if ($("#clearAllOrdersBtn")) {
    $("#clearAllOrdersBtn").onclick = () => {
      if (!confirm("Clear ALL orders? This cannot be undone.")) return;
      saveOrdersDash([]);
      renderOrdersView();
      showToast("All orders cleared.", "success");
    };
  }
}



function initNav() {
  $$(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.view === "add") openAddForm();
      else showView(btn.dataset.view);
    });
  });
  $("#addProductBtn").addEventListener("click",  openAddForm);
  $("#overviewAddBtn").addEventListener("click", openAddForm);
  $("#cancelFormBtn").addEventListener("click",  () => showView("products"));
  $("#cancelFormBtn2").addEventListener("click", () => showView("products"));
}

function openSidebar()  { $("#sidebar").classList.add("mobile-open"); $("#sidebarOverlay").classList.add("show"); }
function closeSidebar() { $("#sidebar").classList.remove("mobile-open"); $("#sidebarOverlay").classList.remove("show"); }

function initMobileNav() {
  $("#sidebarToggle").addEventListener("click", openSidebar);
  $("#sidebarOverlay").addEventListener("click", closeSidebar);
}

/* ─── OVERVIEW ───────────────────────────────────────────── */
function renderOverview() {
  const products   = loadProducts();
  const total      = products.length;
  const inStock    = products.filter(p => p.stock !== "out_of_stock" && p.stock !== "hidden").length;
  const outOfStock = products.filter(p => p.stock === "out_of_stock").length;
  const categories = loadCategories().length;

  $("#statsGrid").innerHTML = `
    <div class="stat-card">
      <div class="stat-icon icon-coral">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
      </div>
      <div class="stat-val">${total}</div>
      <div class="stat-label">Total products</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon icon-green">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="stat-val">${inStock}</div>
      <div class="stat-label">In stock &amp; live</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon icon-amber">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div class="stat-val" style="color:var(--red)">${outOfStock}</div>
      <div class="stat-label">Out of stock</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon icon-navy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h16M4 18h7"/><circle cx="18" cy="18" r="3"/></svg>
      </div>
      <div class="stat-val">${categories}</div>
      <div class="stat-label">Active categories</div>
    </div>
  `;

  // Recent 4 products
  const recent = [...products].reverse().slice(0, 4);
  const s = loadSettings();
  const cur = s.currency || "৳";
  $("#recentGrid").innerHTML = recent.length ? recent.map(p => `
    <div class="recent-card" data-id="${escHtml(p.id)}">
      <div class="recent-thumb">
        ${p.image
          ? `<img src="${escHtml(p.image)}" alt="${escHtml(p.name)}" loading="lazy">`
          : `<div class="recent-thumb-ph">No image</div>`}
      </div>
      <div class="recent-info">
        <div class="recent-name">${escHtml(p.name)}</div>
        <div class="recent-price">${cur}${Number(p.price).toLocaleString("en-US")} • <small>${escHtml(p.department || "")}</small></div>
      </div>
    </div>
  `).join("") : "<p style='color:var(--ink-soft);font-size:.88rem'>No products yet.</p>";

  $$(".recent-card").forEach(c => {
    c.addEventListener("click", () => openEditForm(c.dataset.id));
  });
}

/* ─── PRODUCTS TABLE ─────────────────────────────────────── */
let tableSearchTerm = "";
let departmentFilterVal = "";
let categoryFilterVal = "";
let selectedProductIds = new Set();

function renderProductsTable() {
  const allProducts = loadProducts();
  const allCategories = loadCategories();
  const s = loadSettings();
  const cur = s.currency || "৳";

  // Populate category filter options
  $("#categoryFilter").innerHTML = `<option value="">All Categories</option>` +
    allCategories.map(c => `<option value="${escHtml(c.name)}" ${c.name === categoryFilterVal ? "selected" : ""}>${escHtml(c.name)}</option>`).join("");

  const term = tableSearchTerm.toLowerCase();
  const filtered = allProducts.filter(p => {
    const matchSearch = !term ||
      (p.name || "").toLowerCase().includes(term) ||
      (p.category || "").toLowerCase().includes(term) ||
      (p.subcategory || "").toLowerCase().includes(term);
    const matchDept = !departmentFilterVal || (p.department || "").toLowerCase() === departmentFilterVal.toLowerCase();
    const matchCat  = !categoryFilterVal || p.category === categoryFilterVal;
    return matchSearch && matchDept && matchCat;
  });

  $("#productCount").textContent = `${allProducts.length} total • ${filtered.length} shown`;

  // Quick Stock System Status
  const isGlobalActive = (typeof isStockSystemActive === "function") ? isStockSystemActive() : true;
  const quickStatusTxt = $("#quickStockSystemStatusTxt");
  if (quickStatusTxt) {
    quickStatusTxt.textContent = isGlobalActive ? "ON (Auto)" : "OFF (Manual)";
    quickStatusTxt.style.color = isGlobalActive ? "#16a34a" : "#64748b";
  }

  // Bulk delete button
  const bulkBtn = $("#bulkDeleteBtn");
  if (selectedProductIds.size > 0) {
    bulkBtn.style.display = "inline-flex";
    bulkBtn.textContent = `Delete ${selectedProductIds.size} selected`;
  } else {
    bulkBtn.style.display = "none";
  }

  const tbody = $("#productTableBody");
  const emptyEl = $("#emptyTable");

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  tbody.innerHTML = filtered.map(p => {
    const stock = p.stock || "in_stock";
    const statusMap = {
      in_stock:    `<span class="status-badge status-in">● In stock</span>`,
      out_of_stock:`<span class="status-badge status-out">● Out of stock</span>`,
      hidden:      `<span class="status-badge status-hidden">● Hidden</span>`
    };

    const extraCount = (p.extraImages && p.extraImages.length) ? p.extraImages.length : 0;
    const extraLabel = extraCount > 0 ? `<small style="display:block;color:var(--ink-soft);font-size:.7rem">+${extraCount} extra</small>` : "";

    const sizesCount = (p.sizes && p.sizes.length) ? p.sizes.length : 0;
    const colorsCount = (p.colors && p.colors.length) ? p.colors.length : 0;
    let varSummary = "—";
    if (sizesCount > 0 && colorsCount > 0) {
      varSummary = `${sizesCount} sizes, ${colorsCount} cols`;
    } else if (sizesCount > 0) {
      varSummary = `${sizesCount} sizes`;
    } else if (colorsCount > 0) {
      varSummary = `${colorsCount} colors`;
    }

    // ── LIVE STOCK SUMMARY ──────────────────────────────────
    const isGlobalActive = (typeof isStockSystemActive === "function") ? isStockSystemActive() : true;
    const isProdTracked = (p.trackStock !== false);

    let stockBadgeHtml = statusMap[stock] || statusMap["in_stock"];
    let stockSummaryHtml = "";

    if (stock === "hidden") {
      stockBadgeHtml = statusMap["hidden"];
    } else if (!isGlobalActive || !isProdTracked) {
      // ── MANUAL IN STOCK / OUT OF STOCK MODE (WHEN SYSTEM IS OFF OR ITEM IS UNTRACKED) ──
      const isOut = (stock === "out_of_stock");
      const bg = isOut ? "#fee2e2" : "#dcfce7";
      const col = isOut ? "#991b1b" : "#14532d";
      const border = isOut ? "#fca5a5" : "#86efac";
      const modeLabel = !isGlobalActive ? "Manual Mode (System OFF)" : "Untracked item";

      stockBadgeHtml = `
        <select class="tbl-stock-status-select" data-id="${escHtml(p.id)}" style="font-size:0.78rem;font-weight:700;padding:4px 8px;border-radius:6px;cursor:pointer;border:1.5px solid ${border};background:${bg};color:${col};outline:none;transition:all .15s;">
          <option value="in_stock" ${!isOut ? "selected" : ""}>🟢 In stock</option>
          <option value="out_of_stock" ${isOut ? "selected" : ""}>🔴 Out of stock</option>
          <option value="hidden">👁️ Hidden</option>
        </select>
      `;
      stockSummaryHtml = `<small style="display:block;font-size:.71rem;color:#64748b;margin-top:3px">${modeLabel}</small>`;
    } else if (typeof ensureProductStock === "function" && typeof getProductStockSummary === "function") {
      // ── AUTOMATED STOCK ENGINE (WHEN SYSTEM IS ON) ──
      const liveProds = JSON.parse(localStorage.getItem("ff_products") || "[]");
      const liveP = liveProds.find(x => x.id === p.id) || p;
      ensureProductStock(liveP);
      const sum = getProductStockSummary(liveP);
      const threshold = parseInt((loadSettings() || {}).lowStockThreshold) || 5;
      if (sum.available <= 0) {
        stockBadgeHtml = `<span class="status-badge" style="background:#fee2e2;color:#991b1b">🔴 Out of stock</span>`;
      } else if (sum.available <= threshold) {
        stockBadgeHtml = `<span class="status-badge" style="background:#fef3c7;color:#92400e">🟠 Low stock</span>`;
      } else {
        stockBadgeHtml = `<span class="status-badge status-in">🟢 In stock</span>`;
      }
      stockSummaryHtml = `<small style="display:block;font-size:.73rem;color:#64748b;margin-top:3px">Avail: ${sum.available} · Act: ${sum.actual} · Res: ${sum.reserved}</small>`;
    }
    // ──────────────────────────────────────────────────────

    return `
      <tr data-id="${escHtml(p.id)}" class="${selectedProductIds.has(p.id) ? "selected" : ""}">
        <td class="td-check">
          <input type="checkbox" class="row-check" data-id="${escHtml(p.id)}"
            ${selectedProductIds.has(p.id) ? "checked" : ""}>
        </td>
        <td class="td-drag"><span class="drag-handle" title="Drag to reorder">⠿</span></td>
        <td>
          ${p.image
            ? `<img class="tbl-thumb" src="${escHtml(p.image)}" alt="${escHtml(p.name)}" loading="lazy">`
            : `<div class="tbl-thumb-ph">No img</div>`}
          ${extraLabel}
        </td>
        <td class="tbl-name">${escHtml(p.name)}</td>
        <td>
          <span class="cat-badge-dept">${escHtml(p.department || "All")}</span>
          <div style="font-size:.82rem;font-weight:500;margin-top:2px;">${escHtml(p.category || "—")}</div>
          ${p.subcategory ? `<small style="color:var(--ink-soft)">${escHtml(p.subcategory)}</small>` : ""}
        </td>
        <td>
          <strong>${cur}${Number(p.price).toLocaleString("en-US")}</strong>
          ${p.oldPrice ? `<br><small style="color:var(--ink-soft);text-decoration:line-through">${cur}${Number(p.oldPrice).toLocaleString("en-US")}</small>` : ""}
        </td>
        <td>
          ${stockBadgeHtml}
          ${stockSummaryHtml}
        </td>
        <td style="font-size:.8rem;color:var(--ink-soft)">${escHtml(varSummary)}</td>
        <td>${p.tag ? `<span class="tbl-tag">${escHtml(p.tag)}</span>` : "—"}</td>
        <td class="tbl-actions">
          <button class="btn-tbl btn-tbl-share" data-id="${escHtml(p.id)}" title="Copy product sales link to share on Facebook, WhatsApp, etc.">🔗 Link</button>
          <button class="btn-tbl btn-tbl-stock" data-id="${escHtml(p.id)}" title="Manage stock for this product">📦 Stock</button>
          <button class="btn-tbl btn-tbl-edit" data-id="${escHtml(p.id)}">Edit</button>
          <button class="btn-tbl btn-tbl-del"  data-id="${escHtml(p.id)}">Delete</button>
        </td>
      </tr>
    `;
  }).join("");

  // Wire quick manual stock status dropdowns (when system is OFF or item is untracked)
  $$(".tbl-stock-status-select", tbody).forEach(sel => {
    sel.addEventListener("change", (e) => {
      e.stopPropagation();
      const id = sel.dataset.id;
      const newStatus = sel.value;
      const all = loadProducts();
      const idx = all.findIndex(x => x.id === id);
      if (idx >= 0) {
        all[idx].stock = newStatus;
        saveProducts(all);
        localStorage.setItem("ff_products", JSON.stringify(all));

        const isOut = (newStatus === "out_of_stock");
        const isHidden = (newStatus === "hidden");
        sel.style.background = isOut ? "#fee2e2" : (isHidden ? "#f1f5f9" : "#dcfce7");
        sel.style.color = isOut ? "#991b1b" : (isHidden ? "#475569" : "#14532d");
        sel.style.borderColor = isOut ? "#fca5a5" : (isHidden ? "#cbd5e1" : "#86efac");

        const statusLabel = newStatus === "out_of_stock" ? "🔴 Out of stock" : (newStatus === "hidden" ? "👁️ Hidden" : "🟢 In stock");
        showToast(`"${all[idx].name}" set to ${statusLabel} ✓`, "success");

        if (newStatus === "hidden") {
          renderProductsTable();
        }
      }
    });
  });

  // Wire row actions
  $$(".btn-tbl-share", tbody).forEach(btn =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const p = allProducts.find(x => x.id === id);
      const origin = window.location.origin;
      const path = window.location.pathname.replace(/dashboard\.html$/i, "index.html");
      const url = `${origin}${path}?product=${id}`;
      navigator.clipboard.writeText(url).then(() => {
        showToast(`Copied sales link for "${p ? p.name : id}"! ✓`, "success");
      }).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
        showToast(`Copied sales link for "${p ? p.name : id}"! ✓`, "success");
      });
    })
  );
  $$(".btn-tbl-edit", tbody).forEach(btn =>
    btn.addEventListener("click", () => openEditForm(btn.dataset.id)));
  $$(".btn-tbl-del", tbody).forEach(btn =>
    btn.addEventListener("click", () => openDeleteModal(btn.dataset.id)));
  $$(".btn-tbl-stock", tbody).forEach(btn =>
    btn.addEventListener("click", () => openStockAdjustModal(btn.dataset.id)));

  // Row selection checkboxes
  $$(".row-check", tbody).forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedProductIds.add(cb.dataset.id);
      else selectedProductIds.delete(cb.dataset.id);
      renderProductsTable();
    });
  });

  // Reorder
  initDragReorder(tbody);
}

function initTableFilters() {
  $("#tableSearch").addEventListener("input", e => {
    tableSearchTerm = e.target.value.trim();
    renderProductsTable();
  });
  $("#departmentFilter").addEventListener("change", e => {
    departmentFilterVal = e.target.value;
    renderProductsTable();
  });
  $("#categoryFilter").addEventListener("change", e => {
    categoryFilterVal = e.target.value;
    renderProductsTable();
  });
  $("#selectAllCheck").addEventListener("change", e => {
    const products = loadProducts();
    if (e.target.checked) products.forEach(p => selectedProductIds.add(p.id));
    else selectedProductIds.clear();
    renderProductsTable();
  });
  $("#bulkDeleteBtn").addEventListener("click", () => {
    if (selectedProductIds.size === 0) return;
    $("#bulkDeleteCount").textContent = `${selectedProductIds.size} product${selectedProductIds.size > 1 ? "s" : ""} will be deleted.`;
    $("#bulkDeleteOverlay").classList.add("open");
  });
}

function initDragReorder(tbody) {
  let dragSrcId = null;
  const rows = $$("tr", tbody);
  rows.forEach(row => {
    const handle = $(".drag-handle", row);
    if (!handle) return;
    row.setAttribute("draggable", "true");
    row.addEventListener("dragstart", e => {
      dragSrcId = row.dataset.id;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", e => {
      e.preventDefault();
      $$("tr", tbody).forEach(r => r.classList.remove("drag-over"));
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", e => {
      e.preventDefault();
      row.classList.remove("drag-over");
      if (!dragSrcId || dragSrcId === row.dataset.id) return;
      const products = loadProducts();
      const srcIdx  = products.findIndex(p => p.id === dragSrcId);
      const dstIdx  = products.findIndex(p => p.id === row.dataset.id);
      if (srcIdx < 0 || dstIdx < 0) return;
      const [moved] = products.splice(srcIdx, 1);
      products.splice(dstIdx, 0, moved);
      saveProducts(products);
      renderProductsTable();
      showToast("Order saved ✓", "success");
    });
  });
}

/* ─── ADD / EDIT PRODUCT ─────────────────────────────────── */
let currentMainImageData = "";
let currentExtraImages   = [];
let currentSizes         = [];
let currentColors        = [];

function populateCategoriesDropdown(selectedCatName = "") {
  const categories = loadCategories();
  const currentDept = $("#fDepartment").value || "Men";
  const select = $("#fCategory");

  // Strict department matching: Men only gets Men, Women only gets Women
  let relevantCats = categories;
  if (currentDept === "Men") {
    relevantCats = categories.filter(c => (c.department || "").toLowerCase() === "men");
  } else if (currentDept === "Women") {
    relevantCats = categories.filter(c => (c.department || "").toLowerCase() === "women");
  } else if (currentDept === "Home") {
    relevantCats = categories.filter(c => (c.department || "").toLowerCase() === "home");
  }

  // Fallback to all if none found
  if (!relevantCats.length) relevantCats = categories;

  select.innerHTML = relevantCats.map(c => `
    <option value="${escHtml(c.name)}" ${c.name === selectedCatName ? "selected" : ""}>
      ${escHtml(c.name)} (${escHtml(c.department || "All")})
    </option>
  `).join("");

  updateSubcategoriesDatalist();
  renderDepartmentQuickTags();
}

function updateSubcategoriesDatalist() {
  const categories = loadCategories();
  const selectedName = $("#fCategory").value;
  const cat = categories.find(c => c.name === selectedName);
  const dl = $("#subcategoryList");
  if (cat && cat.subcategories && cat.subcategories.length) {
    dl.innerHTML = cat.subcategories.map(s => `<option value="${escHtml(s)}">`).join("");
  } else {
    dl.innerHTML = "";
  }
}

function renderDepartmentQuickTags() {
  const dept = $("#fDepartment").value || "Men";
  const container = $("#deptQuickTags");
  if (!container) return;

  const categories = loadCategories();
  const hero = loadHero();

  let tags = [];
  if (dept === "Men") {
    if (hero && hero.menSection && Array.isArray(hero.menSection.categories)) {
      tags.push(...hero.menSection.categories);
    }
    const cat = categories.find(c => (c.department || "").toLowerCase() === "men");
    if (cat && cat.subcategories) tags.push(...cat.subcategories);
  } else if (dept === "Women") {
    if (hero && hero.womenSection && Array.isArray(hero.womenSection.categories)) {
      tags.push(...hero.womenSection.categories);
    }
    const cat = categories.find(c => (c.department || "").toLowerCase() === "women");
    if (cat && cat.subcategories) tags.push(...cat.subcategories);
  } else if (dept === "Home") {
    const cat = categories.find(c => (c.department || "").toLowerCase() === "home");
    if (cat && cat.subcategories) tags.push(...cat.subcategories);
  }

  const uniqueTags = [...new Set(tags)];
  if (!uniqueTags.length) {
    container.innerHTML = "";
    return;
  }

  const currentVal = ($("#fSubcategory").value || "").trim().toLowerCase();
  container.innerHTML = uniqueTags.map(tag => `
    <button type="button" class="preset-pill subcat-pill ${tag.toLowerCase() === currentVal ? "active" : ""}" data-subcat="${escHtml(tag)}" style="padding:3px 10px; font-size:.74rem">
      ${escHtml(tag)}
    </button>
  `).join("");

  container.querySelectorAll(".subcat-pill").forEach(btn => {
    btn.onclick = () => {
      $("#fSubcategory").value = btn.dataset.subcat;
      renderDepartmentQuickTags();
      updateLivePreview();
    };
  });
}


function setCurrencyPrefixes() {
  const cur = loadSettings().currency || "৳";
  $$(".input-prefix").forEach(el => el.textContent = cur);
}

function openAddForm() {
  $("#productForm").reset();
  $("#editId").value = "";
  $("#fImageData").value = "";
  currentMainImageData = "";
  currentExtraImages   = [];
  currentSizes         = [];
  currentColors        = [];
  currentVariantStockMap = {};

  if ($("#fTrackStock")) $("#fTrackStock").checked = true;
  if ($("#fSimpleStockQty")) $("#fSimpleStockQty").value = 20;
  if ($("#fProdLowStockThreshold")) $("#fProdLowStockThreshold").value = "";
  if ($("#fVariantLowStockThreshold")) $("#fVariantLowStockThreshold").value = "";

  $("#formTitle").textContent = "Add Product";
  $("#saveBtn").textContent   = "Save product";
  $("#formError").textContent = "";

  populateCategoriesDropdown();
  setCurrencyPrefixes();
  resetMainImageZone();
  renderExtraImagesGrid();
  renderActiveSizes();
  renderActiveColors();
  renderVariantStockInputs();
  updateLivePreview();
  showView("add");
}

function openEditForm(id) {
  const p = loadProducts().find(prod => prod.id === id);
  if (!p) return;

  $("#editId").value       = p.id;
  $("#fName").value        = p.name        || "";
  $("#fDepartment").value  = p.department  || "Men";
  $("#fSubcategory").value = p.subcategory || "";
  $("#fPrice").value       = p.price       || "";
  $("#fOldPrice").value    = p.oldPrice    || "";
  $("#fTag").value         = p.tag         || "";
  $("#fStock").value       = p.stock       || "in_stock";
  $("#fDescription").value = p.description || "";

  populateCategoriesDropdown(p.category || "");

  // Main Image
  currentMainImageData   = p.image || "";
  $("#fImageData").value = p.image || "";
  if (p.image) setMainImagePreview(p.image);
  else resetMainImageZone();

  // Extra Images
  currentExtraImages = Array.isArray(p.extraImages) ? [...p.extraImages] : [];
  renderExtraImagesGrid();

  // Sizes & Colors
  currentSizes  = Array.isArray(p.sizes) ? [...p.sizes] : [];
  currentColors = Array.isArray(p.colors) ? [...p.colors] : [];
  renderActiveSizes();
  renderActiveColors();

  // Stock entries & variant inventory configuration
  if (typeof ensureProductStock === "function") ensureProductStock(p);
  currentVariantStockMap = p.variantStock ? { ...p.variantStock } : {};

  if ($("#fTrackStock")) {
    $("#fTrackStock").checked = (p.trackStock !== false);
  }
  if ($("#fProdLowStockThreshold")) {
    $("#fProdLowStockThreshold").value = p.lowStockThreshold || "";
  }
  if ($("#fVariantLowStockThreshold")) {
    $("#fVariantLowStockThreshold").value = p.lowStockThreshold || "";
  }
  if ($("#fSimpleStockQty")) {
    $("#fSimpleStockQty").value = typeof p.variantStock?.["default"] === "number" ? p.variantStock["default"] : (typeof p.stockQty === "number" ? p.stockQty : 20);
  }
  renderVariantStockInputs();

  $("#formTitle").textContent = "Edit Product";
  $("#saveBtn").textContent   = "Update product";
  $("#formError").textContent = "";

  setCurrencyPrefixes();
  updateLivePreview();
  showView("add");
}

/* ─── MAIN IMAGE HANDLING ────────────────────────────────── */
function initMainImageUpload() {
  const zone      = $("#imgDropZone");
  const input     = $("#imgFileInput");
  const browseBtn = $("#browseBtn");
  const changeBtn = $("#changeImgBtn");
  const removeBtn = $("#removeImgBtn");

  browseBtn.onclick = e => { e.stopPropagation(); input.click(); };
  changeBtn.onclick = e => { e.stopPropagation(); input.click(); };
  zone.onclick      = () => { if (!currentMainImageData) input.click(); };

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = await compressImage(file);
      currentMainImageData = data;
      $("#fImageData").value = data;
      setMainImagePreview(data);
      updateLivePreview();
      showToast("Main image loaded ✓", "success");
    } catch {
      showToast("Could not process image.", "error");
    }
    input.value = "";
  };

  zone.ondragover = e => { e.preventDefault(); zone.classList.add("dragover"); };
  zone.ondragleave = () => zone.classList.remove("dragover");
  zone.ondrop = async e => {
    e.preventDefault();
    zone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const data = await compressImage(file);
      currentMainImageData = data;
      $("#fImageData").value = data;
      setMainImagePreview(data);
      updateLivePreview();
      showToast("Main image loaded ✓", "success");
    }
  };

  removeBtn.onclick = e => {
    e.stopPropagation();
    currentMainImageData = "";
    $("#fImageData").value = "";
    resetMainImageZone();
    updateLivePreview();
  };

  $("#useUrlBtn").onclick = () => {
    const url = $("#fImageUrl").value.trim();
    if (!url) return;
    currentMainImageData = url;
    $("#fImageData").value = url;
    setMainImagePreview(url);
    updateLivePreview();
    showToast("Main image URL applied ✓", "success");
  };
}

function setMainImagePreview(src) {
  $("#imgUploadInner").style.display = "none";
  $("#imgPreviewWrap").style.display = "block";
  $("#imgUploadedPreview").src = src;
}

function resetMainImageZone() {
  $("#imgUploadInner").style.display = "flex";
  $("#imgPreviewWrap").style.display = "none";
  $("#imgUploadedPreview").src = "";
}

/* ─── EXTRA IMAGES HANDLING ──────────────────────────────── */
function initExtraImagesUpload() {
  const card  = $("#extraUploadCard");
  const input = $("#extraImgFileInput");

  card.onclick = () => input.click();

  input.onchange = async () => {
    const files = Array.from(input.files);
    if (!files.length) return;
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        try {
          const comp = await compressImage(file);
          currentExtraImages.push(comp);
        } catch (e) {}
      }
    }
    input.value = "";
    renderExtraImagesGrid();
    showToast(`${files.length} extra photo(s) added ✓`, "success");
  };

  // Add extra image by URL
  $("#addExtraUrlBtn").onclick = () => {
    const url = $("#fExtraImageUrl").value.trim();
    if (!url) return;
    currentExtraImages.push(url);
    $("#fExtraImageUrl").value = "";
    renderExtraImagesGrid();
    showToast("Extra image URL added ✓", "success");
  };
}

function renderExtraImagesGrid() {
  const grid = $("#extraThumbsGrid");
  const uploadCard = $("#extraUploadCard");
  $("#extraImgCounter").textContent = `${currentExtraImages.length} extra photo${currentExtraImages.length === 1 ? "" : "s"}`;

  // Keep upload card
  grid.innerHTML = "";
  grid.appendChild(uploadCard);

  // Render extra image items
  currentExtraImages.forEach((src, idx) => {
    const item = document.createElement("div");
    item.className = "extra-thumb-item";
    item.innerHTML = `
      <img src="${escHtml(src)}" alt="Extra photo ${idx + 1}">
      <button type="button" class="thumb-del" data-idx="${idx}" title="Remove photo">✕</button>
    `;
    grid.insertBefore(item, uploadCard);
  });

  // Wire deletes
  grid.querySelectorAll(".thumb-del").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      currentExtraImages.splice(idx, 1);
      renderExtraImagesGrid();
    };
  });
}

/* ─── SIZES & COLORS MANAGERS ────────────────────────────── */
function initSizesAndColorsManagers() {
  // Size Presets
  $$("#sizePresetStrip .preset-pill").forEach(btn => {
    btn.onclick = () => {
      const size = btn.dataset.size;
      if (currentSizes.includes(size)) {
        currentSizes = currentSizes.filter(s => s !== size);
      } else {
        currentSizes.push(size);
      }
      renderActiveSizes();
      updateLivePreview();
    };
  });

  // Custom Size
  $("#addCustomSizeBtn").onclick = () => {
    const val = $("#customSizeInput").value.trim();
    if (!val || currentSizes.includes(val)) return;
    currentSizes.push(val);
    $("#customSizeInput").value = "";
    renderActiveSizes();
    updateLivePreview();
  };
  $("#customSizeInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); $("#addCustomSizeBtn").click(); }
  });

  // Color Presets
  $$("#colorPresetStrip .preset-pill").forEach(btn => {
    btn.onclick = () => {
      const color = btn.dataset.color;
      if (currentColors.includes(color)) {
        currentColors = currentColors.filter(c => c !== color);
      } else {
        currentColors.push(color);
      }
      renderActiveColors();
      updateLivePreview();
    };
  });

  // Custom Color
  $("#addCustomColorBtn").onclick = () => {
    const val = $("#customColorInput").value.trim();
    if (!val || currentColors.includes(val)) return;
    currentColors.push(val);
    $("#customColorInput").value = "";
    renderActiveColors();
    updateLivePreview();
  };
  $("#customColorInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); $("#addCustomColorBtn").click(); }
  });
}

function renderActiveSizes() {
  const box = $("#activeSizesBox");
  box.innerHTML = currentSizes.length ? currentSizes.map((s, idx) => `
    <span class="active-chip">
      <span>${escHtml(s)}</span>
      <button type="button" class="chip-del" data-type="size" data-val="${escHtml(s)}">✕</button>
    </span>
  `).join("") : `<span style="font-size:.78rem;color:var(--ink-soft)">No sizes added (defaults to standard).</span>`;

  // Highlight active presets
  $$("#sizePresetStrip .preset-pill").forEach(btn => {
    btn.classList.toggle("active", currentSizes.includes(btn.dataset.size));
  });

  box.querySelectorAll(".chip-del").forEach(btn => {
    btn.onclick = () => {
      currentSizes = currentSizes.filter(s => s !== btn.dataset.val);
      renderActiveSizes();
      updateLivePreview();
    };
  });
}

function renderActiveColors() {
  const box = $("#activeColorsBox");
  box.innerHTML = currentColors.length ? currentColors.map((c, idx) => `
    <span class="active-chip">
      <span class="color-dot" style="background:${getColorHex(c)}"></span>
      <span>${escHtml(c)}</span>
      <button type="button" class="chip-del" data-type="color" data-val="${escHtml(c)}">✕</button>
    </span>
  `).join("") : `<span style="font-size:.78rem;color:var(--ink-soft)">No colors added.</span>`;

  // Highlight active presets
  $$("#colorPresetStrip .preset-pill").forEach(btn => {
    btn.classList.toggle("active", currentColors.includes(btn.dataset.color));
  });

  box.querySelectorAll(".chip-del").forEach(btn => {
    btn.onclick = () => {
      currentColors = currentColors.filter(c => c !== btn.dataset.val);
      renderActiveColors();
      renderVariantStockInputs();
      updateLivePreview();
    };
  });
  renderVariantStockInputs();
}

/* ─── INVENTORY & VARIANT STOCK ENTRY (PRODUCT FORM) ─────── */
let currentVariantStockMap = {};

function renderVariantStockInputs() {
  const group = $("#stockEntryGroup");
  if (!group) return;

  const trackStockCheckbox = $("#fTrackStock");
  const isTracking = trackStockCheckbox ? trackStockCheckbox.checked : true;

  const badge = $("#stockTrackingStatusBadge");
  const detailsWrap = $("#stockEntryDetailsWrap");
  const disabledNote = $("#stockTrackingDisabledNote");

  if (!isTracking) {
    if (badge) {
      badge.textContent = "TRACKING OFF";
      badge.style.background = "#f1f5f9";
      badge.style.color = "#64748b";
    }
    if (detailsWrap) detailsWrap.style.display = "none";
    if (disabledNote) disabledNote.style.display = "block";
    return;
  }

  if (badge) {
    badge.textContent = "TRACKING ON";
    badge.style.background = "#ecfdf5";
    badge.style.color = "#065f46";
  }
  if (detailsWrap) detailsWrap.style.display = "block";
  if (disabledNote) disabledNote.style.display = "none";

  const simpleWrap = $("#simpleStockEntryWrap");
  const variantWrap = $("#variantStockEntryWrap");
  const tbody = $("#variantStockTableBody");

  const hasVariants = (currentSizes && currentSizes.length > 0) || (currentColors && currentColors.length > 0);

  if (!hasVariants) {
    if (simpleWrap) simpleWrap.style.display = "block";
    if (variantWrap) variantWrap.style.display = "none";
    if ($("#fSimpleStockQty")) {
      if (typeof currentVariantStockMap["default"] === "number") {
        $("#fSimpleStockQty").value = currentVariantStockMap["default"];
      }
    }
  } else {
    if (simpleWrap) simpleWrap.style.display = "none";
    if (variantWrap) variantWrap.style.display = "block";

    const sizes = (currentSizes && currentSizes.length > 0) ? currentSizes : [""];
    const colors = (currentColors && currentColors.length > 0) ? currentColors : [""];

    const rows = [];
    sizes.forEach(s => {
      colors.forEach(c => {
        const vKey = (typeof makeVariantKey === "function") ? makeVariantKey(s, c) : `${s}__${c}`;
        const vLabel = (typeof formatVariantLabel === "function") ? formatVariantLabel(s, c) : ([c, s].filter(Boolean).join(" / ") || "Standard");

        let qty = currentVariantStockMap[vKey];
        if (typeof qty !== "number") {
          qty = 20;
          currentVariantStockMap[vKey] = qty;
        }

        const colorDot = c ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${getColorHex(c)};margin-right:6px;vertical-align:middle;border:1px solid rgba(0,0,0,0.15)"></span>` : "";

        rows.push(`
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 12px;font-weight:600;color:var(--navy);">
              ${colorDot}${escHtml(vLabel)}
            </td>
            <td style="padding:6px 12px;text-align:right;">
              <input type="number" min="0" class="form-input variant-stock-input" data-vkey="${escHtml(vKey)}" value="${qty}" style="width:90px;text-align:center;font-weight:700;padding:5px 8px;border:1.5px solid #cbd5e1;border-radius:5px;">
            </td>
          </tr>
        `);
      });
    });

    if (tbody) {
      tbody.innerHTML = rows.join("");

      tbody.querySelectorAll(".variant-stock-input").forEach(input => {
        input.oninput = () => {
          const key = input.dataset.vkey;
          const val = Math.max(0, parseInt(input.value) || 0);
          currentVariantStockMap[key] = val;
          recalculateVariantStockTotal();
        };
      });
    }

    recalculateVariantStockTotal();
  }
}

function recalculateVariantStockTotal() {
  const lbl = $("#variantStockTotalLabel");
  if (!lbl) return;
  const tbody = $("#variantStockTableBody");
  if (!tbody) return;
  let sum = 0;
  tbody.querySelectorAll(".variant-stock-input").forEach(inp => {
    sum += Math.max(0, parseInt(inp.value) || 0);
  });
  const count = tbody.querySelectorAll("tr").length;
  lbl.textContent = `Total Stock: ${sum} units across ${count} variant${count === 1 ? '' : 's'}`;
}

function updateStockSystemMasterUI(isActive) {
  const masterToggle = $("#sStockSystemMasterToggle");
  const masterLabel = $("#sStockSystemMasterLabel");
  const masterDesc = $("#stockSystemMasterDesc");
  const quickTxt = $("#quickStockSystemStatusTxt");

  if (masterToggle) masterToggle.checked = isActive;
  if (masterLabel) {
    masterLabel.textContent = isActive ? "🟢 ENABLED (Auto Engine)" : "⚪ DISABLED (Manual Mode)";
    masterLabel.style.color = isActive ? "#16a34a" : "#64748b";
  }
  if (masterDesc) {
    if (isActive) {
      masterDesc.style.background = "#ecfdf5";
      masterDesc.style.color = "#065f46";
      masterDesc.style.borderColor = "#a7f3d0";
      masterDesc.innerHTML = "🟢 <strong>Stock System is ACTIVE</strong>: Inventory counts are tracked automatically. Orders reserve stock, confirmation deducts stock, low-stock alerts are shown, and overselling is prevented.";
    } else {
      masterDesc.style.background = "#f8fafc";
      masterDesc.style.color = "#475569";
      masterDesc.style.borderColor = "#cbd5e1";
      masterDesc.innerHTML = "⚪ <strong>Stock System is DISABLED (Manual In/Out Mode)</strong>: Automated stock deduction and reservations are off. You can manually set each product to <strong>🟢 In stock</strong> or <strong>🔴 Out of stock</strong> directly in the Products table!";
    }
  }
  if (quickTxt) {
    quickTxt.textContent = isActive ? "ON (Auto)" : "OFF (Manual)";
    quickTxt.style.color = isActive ? "#16a34a" : "#64748b";
  }
}

function initStockEntryHandlers() {
  const trackCheckbox = $("#fTrackStock");
  if (trackCheckbox) {
    trackCheckbox.onchange = () => renderVariantStockInputs();
  }

  const applyBulkBtn = $("#applyBulkVariantQtyBtn");
  if (applyBulkBtn) {
    applyBulkBtn.onclick = () => {
      const bulkVal = Math.max(0, parseInt($("#bulkVariantQtyInput")?.value) || 0);
      const tbody = $("#variantStockTableBody");
      if (tbody) {
        tbody.querySelectorAll(".variant-stock-input").forEach(inp => {
          inp.value = bulkVal;
          currentVariantStockMap[inp.dataset.vkey] = bulkVal;
        });
        recalculateVariantStockTotal();
        showToast(`Set all variants to ${bulkVal} units ✓`, "success");
      }
    };
  }

  const quickToggleBtn = $("#quickStockSystemToggleBtn");
  if (quickToggleBtn) {
    quickToggleBtn.onclick = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const s = loadSettings();
      const currentActive = (s.stockSystemEnabled !== false);
      const newActive = !currentActive;
      s.stockSystemEnabled = newActive;
      saveSettings(s);
      updateStockSystemMasterUI(newActive);
      renderProductsTable();
      showToast(`Stock System: ${newActive ? "ACTIVATED 🟢 (Auto stock tracking & deduction)" : "DISABLED ⚪ (Manual In / Out of Stock mode)"}`, "success");
    };
  }

  const masterToggle = $("#sStockSystemMasterToggle");
  if (masterToggle) {
    const handleToggle = () => {
      const isChecked = masterToggle.checked;
      const s = loadSettings();
      s.stockSystemEnabled = isChecked;
      saveSettings(s);
      updateStockSystemMasterUI(isChecked);
      renderProductsTable();
      showToast(`Stock System: ${isChecked ? "ACTIVATED 🟢 (Auto stock tracking & deduction)" : "DISABLED ⚪ (Manual In / Out of Stock mode)"}`, "success");
    };
    masterToggle.onchange = handleToggle;
    masterToggle.addEventListener("input", handleToggle);
  }
}


/* ─── LIVE PRODUCT PREVIEW ───────────────────────────────── */
function updateLivePreview() {
  const name  = $("#fName").value.trim()        || "Product name";
  const dept  = $("#fDepartment").value         || "Men";
  const cat   = $("#fCategory").value           || "Fashion";
  const subcat= $("#fSubcategory").value.trim() || "";
  const price = parseFloat($("#fPrice").value)  || 0;
  const oldP  = parseFloat($("#fOldPrice").value);
  const tag   = $("#fTag").value.trim();
  const stock = $("#fStock").value;
  const s     = loadSettings();
  const cur   = s.currency || "৳";

  $("#previewName").textContent = name;
  $("#previewCat").textContent  = `${dept} • ${cat}${subcat ? " / " + subcat : ""}`;
  $("#previewPrice").textContent = cur + price.toLocaleString("en-US");
  $("#previewOld").textContent   = (oldP && !isNaN(oldP)) ? cur + oldP.toLocaleString("en-US") : "";

  // Tag
  const tagBadge = $("#previewTagBadge");
  if (tag) { tagBadge.textContent = tag; tagBadge.style.display = "block"; }
  else { tagBadge.style.display = "none"; }

  // Stock badge on image
  const stockTag = $("#previewStockBadgeTag");
  const banner = $("#previewStockBanner");
  const btnState = $("#previewBtnState");

  if (stock === "out_of_stock") {
    stockTag.textContent = "Out of stock";
    stockTag.className   = "preview-stock-badge-tag out-of-stock";
    stockTag.style.display = "block";
    banner.textContent   = "⚠ Out of Stock — 'Add to bag' will be disabled on storefront.";
    banner.style.color   = "var(--red)";
    btnState.textContent = "Out of stock";
    btnState.style.background = "var(--paper)";
    btnState.style.color = "var(--ink-soft)";
  } else if (stock === "hidden") {
    stockTag.textContent = "Hidden";
    stockTag.className   = "preview-stock-badge-tag hidden";
    stockTag.style.display = "block";
    banner.textContent   = "👁 Hidden — Customers will NOT see this product.";
    banner.style.color   = "var(--amber)";
    btnState.textContent = "Hidden from store";
    btnState.style.background = "var(--paper)";
    btnState.style.color = "var(--ink-soft)";
  } else {
    stockTag.style.display = "none";
    banner.textContent   = "✓ Live & In Stock on storefront.";
    banner.style.color   = "var(--green)";
    btnState.textContent = "Add to bag";
    btnState.style.background = "#fff";
    btnState.style.color = "var(--navy)";
  }

  // Variants preview line
  const vLine = $("#previewVariantsLine");
  const parts = [];
  if (currentSizes.length) parts.push(`${currentSizes.length} sizes`);
  if (currentColors.length) parts.push(`${currentColors.length} colors`);
  if (currentExtraImages.length) parts.push(`${currentExtraImages.length} extra photos`);
  vLine.textContent = parts.length ? `Variants: ${parts.join(" • ")}` : "";

  // Image preview
  const pImg = $("#previewImg");
  const pPh  = $("#previewPlaceholder");
  if (currentMainImageData) {
    pImg.src = currentMainImageData;
    pImg.style.display = "block";
    pPh.style.display  = "none";
    pImg.onerror = () => { pImg.style.display = "none"; pPh.style.display = "flex"; };
  } else {
    pImg.style.display = "none";
    pPh.style.display  = "flex";
  }
}

function initLivePreviewListeners() {
  ["#fName","#fDepartment","#fCategory","#fSubcategory","#fPrice","#fOldPrice","#fTag","#fStock"].forEach(sel => {
    const el = $(sel);
    if (el) {
      el.addEventListener("input",  updateLivePreview);
      el.addEventListener("change", updateLivePreview);
    }
  });

  // When department changes, update category dropdown and quick tags
  $("#fDepartment").addEventListener("change", () => {
    populateCategoriesDropdown();
  });
  $("#fCategory").addEventListener("change", () => {
    updateSubcategoriesDatalist();
  });
  $("#fSubcategory").addEventListener("input", () => {
    renderDepartmentQuickTags();
  });

  $("#fDescription").addEventListener("input", e => {
    $("#descCharCount").textContent = `${e.target.value.length} characters`;
  });
}


/* ─── FORM SUBMIT (SAVE PRODUCT) ─────────────────────────── */
function handleProductFormSubmit(e) {
  e.preventDefault();
  const errEl = $("#formError");
  errEl.textContent = "";

  const name       = $("#fName").value.trim();
  const department = $("#fDepartment").value;
  const category   = $("#fCategory").value;
  const subcategory= $("#fSubcategory").value.trim();
  const price      = parseFloat($("#fPrice").value);
  const oldPrice   = parseFloat($("#fOldPrice").value) || null;
  const tag        = $("#fTag").value.trim();
  const stock      = $("#fStock").value;
  const description= $("#fDescription").value.trim();
  const image      = currentMainImageData;

  if (!name) { errEl.textContent = "Product name is required."; return; }
  if (!category) { errEl.textContent = "Please select a category."; return; }
  if (isNaN(price) || price < 0) { errEl.textContent = "Enter a valid positive price."; return; }
  if (!image) { errEl.textContent = "Please upload or provide a main image."; return; }
  if (!description) { errEl.textContent = "Product description is required."; return; }

  const products = loadProducts();
  const editId   = $("#editId").value;

  // ── INVENTORY & STOCK ENTRY PROCESSING ──────────────────────
  const trackStock = $("#fTrackStock") ? $("#fTrackStock").checked : true;
  let variantStock = {};
  let totalStockQty = 0;
  let prodThreshold = undefined;

  const hasVariants = (currentSizes && currentSizes.length > 0) || (currentColors && currentColors.length > 0);

  if (trackStock) {
    if (hasVariants) {
      const sizes = currentSizes.length ? currentSizes : [""];
      const colors = currentColors.length ? currentColors : [""];
      sizes.forEach(s => {
        colors.forEach(c => {
          const vKey = (typeof makeVariantKey === "function") ? makeVariantKey(s, c) : `${s}__${c}`;
          const val = typeof currentVariantStockMap[vKey] === "number" ? currentVariantStockMap[vKey] : 20;
          variantStock[vKey] = Math.max(0, val);
          totalStockQty += variantStock[vKey];
        });
      });
      const thVal = parseInt($("#fVariantLowStockThreshold")?.value);
      if (!isNaN(thVal) && thVal >= 0) prodThreshold = thVal;
    } else {
      const simpleQty = Math.max(0, parseInt($("#fSimpleStockQty")?.value) || 0);
      variantStock = { default: simpleQty };
      totalStockQty = simpleQty;
      const thVal = parseInt($("#fProdLowStockThreshold")?.value);
      if (!isNaN(thVal) && thVal >= 0) prodThreshold = thVal;
    }
  } else {
    variantStock = { default: 999999 };
    totalStockQty = 999999;
  }

  let effectiveStock = stock;
  if (trackStock && stock !== "hidden") {
    if (totalStockQty <= 0) effectiveStock = "out_of_stock";
    else if (effectiveStock === "out_of_stock" && totalStockQty > 0) effectiveStock = "in_stock";
  }

  const productData = {
    name,
    department,
    category,
    subcategory: subcategory || undefined,
    price,
    image,
    extraImages: currentExtraImages.length ? currentExtraImages : undefined,
    stock: effectiveStock,
    sizes: currentSizes.length ? currentSizes : undefined,
    colors: currentColors.length ? currentColors : undefined,
    description,
    trackStock,
    variantStock,
    stockQty: totalStockQty
  };
  if (tag) productData.tag = tag;
  if (oldPrice) productData.oldPrice = oldPrice;
  if (prodThreshold !== undefined) productData.lowStockThreshold = prodThreshold;

  if (editId) {
    const idx = products.findIndex(p => p.id === editId);
    if (idx >= 0) {
      products[idx] = { id: editId, ...productData };
    }
    saveProducts(products);

    if (trackStock && typeof recordStockHistory === "function") {
      recordStockHistory({
        productId: editId,
        productName: name,
        variantKey: "all",
        variantLabel: "Stock Configuration",
        delta: 0,
        prevStock: 0,
        newStock: totalStockQty,
        action: "product_updated",
        reason: `Stock set to ${totalStockQty} via Product Edit`,
        actor: "Admin"
      });
    }

    showToast("Product updated successfully! ✓", "success");
  } else {
    productData.id = uid("p");
    products.push(productData);
    saveProducts(products);

    if (trackStock && typeof recordStockHistory === "function") {
      recordStockHistory({
        productId: productData.id,
        productName: name,
        variantKey: "all",
        variantLabel: "Initial Stock",
        delta: totalStockQty,
        prevStock: 0,
        newStock: totalStockQty,
        action: "product_created",
        reason: `Initial stock entered on product creation (${totalStockQty} units)`,
        actor: "Admin"
      });
    }

    showToast("Product added successfully! ✓", "success");
  }

  renderProductsTable();
  showView("products");
}

/* ─── DEPARTMENT MANAGEMENT ──────────────────────────────── */
function populateDepartmentsDropdowns() {
  const depts = loadDepartments();

  // 1. In Add/Edit Product form (#fDepartment)
  const fDept = $("#fDepartment");
  if (fDept) {
    const currentVal = fDept.value || "Men";
    fDept.innerHTML = depts
      .filter(d => d.slug !== "all")
      .map(d => `<option value="${escHtml(d.name)}" ${d.name === currentVal ? "selected" : ""}>${escHtml(d.name)}</option>`)
      .join("");
    if (depts.some(d => d.name === currentVal)) fDept.value = currentVal;
  }

  // 2. In Table Filter (#departmentFilter)
  const filterDept = $("#departmentFilter");
  if (filterDept) {
    const curFilter = filterDept.value;
    filterDept.innerHTML = `<option value="">All Departments</option>` +
      depts.filter(d => d.slug !== "all").map(d => `<option value="${escHtml(d.name)}" ${d.name === curFilter ? "selected" : ""}>${escHtml(d.name)}</option>`).join("");
    filterDept.value = curFilter;
  }

  // 3. In Add/Edit Category Modal (#catModalDept)
  const catDept = $("#catModalDept");
  if (catDept) {
    const curCatDept = catDept.value || "Men";
    catDept.innerHTML = depts
      .map(d => `<option value="${escHtml(d.name)}" ${d.name === curCatDept ? "selected" : ""}>${escHtml(d.name)}</option>`)
      .join("");
  }
}

function renderDepartmentsTable() {
  const tbody = $("#departmentsTableBody");
  if (!tbody) return;
  const depts = loadDepartments();
  const products = loadProducts();
  const categories = loadCategories();

  tbody.innerHTML = depts.map(d => {
    const isAll = d.slug === "all" || d.id === "dept_all";
    const pCount = isAll ? products.length : products.filter(p => (p.department || "").toLowerCase() === (d.name || "").toLowerCase()).length;
    const cCount = isAll ? categories.length : categories.filter(c => (c.department || "").toLowerCase() === (d.name || "").toLowerCase()).length;

    return `
      <tr data-dept="${escHtml(d.name)}">
        <td><strong style="color:var(--navy)">${escHtml(d.name)}</strong></td>
        <td><span class="cat-badge-dept">${escHtml(d.name)}</span></td>
        <td><strong>${pCount}</strong> product${pCount === 1 ? "" : "s"}</td>
        <td><span style="font-size:.84rem;color:var(--ink-soft)">${cCount} categories</span></td>
        <td class="tbl-actions">
          <button class="btn-tbl btn-tbl-edit btn-dept-edit" data-id="${escHtml(d.id)}">Edit / Rename</button>
          ${!isAll ? `<button class="btn-tbl btn-tbl-del btn-dept-del" data-id="${escHtml(d.id)}">Delete</button>` : `<span style="font-size:.76rem;color:var(--ink-soft)">(Default)</span>`}
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".btn-dept-edit").forEach(btn => {
    btn.onclick = () => openDepartmentModal(btn.dataset.id);
  });
  tbody.querySelectorAll(".btn-dept-del").forEach(btn => {
    btn.onclick = () => confirmDeleteDepartment(btn.dataset.id);
  });
}

function openDepartmentModal(deptId = null) {
  const modal = $("#departmentModal");
  const form = $("#departmentModalForm");
  form.reset();

  if (deptId) {
    const depts = loadDepartments();
    const dept = depts.find(d => d.id === deptId);
    if (!dept) return;
    $("#departmentModalTitle").textContent = "Edit Department";
    $("#editDepartmentId").value = dept.id;
    $("#originalDepartmentName").value = dept.name;
    $("#deptModalName").value = dept.name;
    $("#deptRenameNotice").style.display = "block";
    $("#saveDeptModalBtn").textContent = "Update Department";
  } else {
    $("#departmentModalTitle").textContent = "Add Department";
    $("#editDepartmentId").value = "";
    $("#originalDepartmentName").value = "";
    $("#deptModalName").value = "";
    $("#deptRenameNotice").style.display = "none";
    $("#saveDeptModalBtn").textContent = "Create Department";
  }

  modal.classList.add("open");
  setTimeout(() => $("#deptModalName").focus(), 80);
}

function closeDepartmentModal() {
  $("#departmentModal").classList.remove("open");
}

function handleDepartmentModalSubmit(e) {
  e.preventDefault();
  const name = $("#deptModalName").value.trim();
  const editId = $("#editDepartmentId").value;
  const originalName = $("#originalDepartmentName").value.trim();

  if (!name) return;

  let depts = loadDepartments();

  if (editId) {
    // Edit / Rename
    const idx = depts.findIndex(d => d.id === editId);
    if (idx >= 0) {
      depts[idx].name = name;
      if (depts[idx].slug !== "all") depts[idx].slug = name;
    }
    saveDepartments(depts);

    // CASCADE: update all products and categories with old department name!
    if (originalName && originalName !== name) {
      let products = loadProducts();
      let pUpdated = 0;
      products = products.map(p => {
        if ((p.department || "").toLowerCase() === originalName.toLowerCase()) {
          pUpdated++;
          return { ...p, department: name };
        }
        return p;
      });
      if (pUpdated > 0) saveProducts(products);

      let categories = loadCategories();
      let cUpdated = 0;
      categories = categories.map(c => {
        if ((c.department || "").toLowerCase() === originalName.toLowerCase()) {
          cUpdated++;
          return { ...c, department: name };
        }
        return c;
      });
      if (cUpdated > 0) saveCategories(categories);

      showToast(`Department renamed to "${name}"! Updated ${pUpdated} product(s) & ${cUpdated} category(ies). ✓`, "success");
    } else {
      showToast("Department updated ✓", "success");
    }
  } else {
    // Add new
    if (depts.some(d => d.name.toLowerCase() === name.toLowerCase())) {
      showToast("Department already exists.", "error");
      return;
    }
    depts.push({
      id: uid("dept"),
      name,
      slug: name
    });
    saveDepartments(depts);
    showToast(`Department "${name}" created ✓`, "success");
  }

  closeDepartmentModal();
  populateDepartmentsDropdowns();
  renderDepartmentsTable();
  renderCategoriesTable();
  renderProductsTable();
}

function confirmDeleteDepartment(deptId) {
  const depts = loadDepartments();
  const dept = depts.find(d => d.id === deptId);
  if (!dept) return;

  const products = loadProducts();
  const affected = products.filter(p => (p.department || "").toLowerCase() === dept.name.toLowerCase());

  const ok = confirm(`Delete department "${dept.name}"?\n${affected.length ? affected.length + " product(s) in this department will be moved to 'All items'." : ""}`);
  if (!ok) return;

  const remaining = depts.filter(d => d.id !== deptId);
  saveDepartments(remaining);

  if (affected.length) {
    const updatedProducts = products.map(p => {
      if ((p.department || "").toLowerCase() === dept.name.toLowerCase()) {
        return { ...p, department: "All" };
      }
      return p;
    });
    saveProducts(updatedProducts);
  }

  const categories = loadCategories();
  const updatedCategories = categories.map(c => {
    if ((c.department || "").toLowerCase() === dept.name.toLowerCase()) {
      return { ...c, department: "All" };
    }
    return c;
  });
  saveCategories(updatedCategories);

  showToast(`Department "${dept.name}" removed ✓`, "info");
  populateDepartmentsDropdowns();
  renderDepartmentsTable();
  renderCategoriesTable();
  renderProductsTable();
}

/* ─── CATEGORY MANAGEMENT ────────────────────────────────── */
let pendingDeleteCategoryName = null;


function renderCategoriesTable() {
  const categories = loadCategories();
  const products   = loadProducts();
  const tbody      = $("#categoriesTableBody");

  tbody.innerHTML = categories.map(cat => {
    const prodCount = products.filter(p => p.category === cat.name).length;
    const subcats = (cat.subcategories || []).map(s => `<span class="cat-subcat-chip">${escHtml(s)}</span>`).join(" ");

    return `
      <tr data-cat="${escHtml(cat.name)}">
        <td><strong>${escHtml(cat.name)}</strong></td>
        <td><span class="cat-badge-dept">${escHtml(cat.department || "All")}</span></td>
        <td><div class="cat-subcats-list">${subcats || "—"}</div></td>
        <td><strong>${prodCount}</strong> product${prodCount === 1 ? "" : "s"}</td>
        <td class="tbl-actions">
          <button class="btn-tbl btn-tbl-edit btn-cat-edit" data-id="${escHtml(cat.id || "")}" data-name="${escHtml(cat.name)}">Edit / Rename</button>
          <button class="btn-tbl btn-tbl-del btn-cat-del" data-name="${escHtml(cat.name)}">Delete</button>
        </td>
      </tr>
    `;
  }).join("");

  // Edit category
  tbody.querySelectorAll(".btn-cat-edit").forEach(btn => {
    btn.onclick = () => openCategoryModal(btn.dataset.name);
  });

  // Delete category
  tbody.querySelectorAll(".btn-cat-del").forEach(btn => {
    btn.onclick = () => openDeleteCategoryModal(btn.dataset.name);
  });
}

function openCategoryModal(catName = "") {
  const modal = $("#categoryModal");
  const form  = $("#categoryModalForm");
  form.reset();

  if (catName) {
    // Edit Mode
    const categories = loadCategories();
    const cat = categories.find(c => c.name === catName);
    $("#categoryModalTitle").textContent = "Edit Category";
    $("#editCategoryId").value = cat ? cat.id : "";
    $("#originalCategoryName").value = catName;
    $("#catModalName").value = catName;
    $("#catModalDept").value = cat ? (cat.department || "All") : "All";
    $("#catModalSubcats").value = cat && cat.subcategories ? cat.subcategories.join(", ") : "";
    $("#catRenameNotice").style.display = "block";
    $("#saveCatModalBtn").textContent = "Update Category";
  } else {
    // Add Mode
    $("#categoryModalTitle").textContent = "Add Category";
    $("#editCategoryId").value = "";
    $("#originalCategoryName").value = "";
    $("#catRenameNotice").style.display = "none";
    $("#saveCatModalBtn").textContent = "Create Category";
  }

  modal.classList.add("open");
}

function closeCategoryModal() {
  $("#categoryModal").classList.remove("open");
}

function handleCategoryModalSubmit(e) {
  e.preventDefault();
  const originalName = $("#originalCategoryName").value.trim();
  const newName      = $("#catModalName").value.trim();
  const dept         = $("#catModalDept").value;
  const subcatsStr   = $("#catModalSubcats").value.trim();
  const subcategories= subcatsStr ? subcatsStr.split(",").map(s => s.trim()).filter(Boolean) : [];

  if (!newName) return;

  const categories = loadCategories();
  let products     = loadProducts();

  if (originalName) {
    // Updating existing category
    const idx = categories.findIndex(c => c.name === originalName);
    if (idx >= 0) {
      categories[idx].name = newName;
      categories[idx].department = dept;
      categories[idx].subcategories = subcategories;
    }

    // AUTOMATIC UPDATE: Rename category in all products!
    if (originalName !== newName) {
      let updatedCount = 0;
      products = products.map(p => {
        if (p.category === originalName) {
          updatedCount++;
          return { ...p, category: newName };
        }
        return p;
      });
      saveProducts(products);
      showToast(`Category renamed! Updated ${updatedCount} product(s). ✓`, "success");
    } else {
      showToast("Category updated ✓", "success");
    }
  } else {
    // Create new category
    if (categories.some(c => c.name.toLowerCase() === newName.toLowerCase())) {
      showToast("Category name already exists.", "error");
      return;
    }
    categories.push({
      id: uid("cat"),
      name: newName,
      department: dept,
      subcategories
    });
    showToast("Category created ✓", "success");
  }

  saveCategories(categories);
  closeCategoryModal();
  renderCategoriesTable();
  populateCategoriesDropdown();
}

function openDeleteCategoryModal(catName) {
  pendingDeleteCategoryName = catName;
  const products = loadProducts();
  const count = products.filter(p => p.category === catName).length;

  $("#deleteCategoryName").textContent = `Category "${catName}"`;
  $("#deleteCategoryNote").textContent = count > 0
    ? `Warning: ${count} product(s) currently belong to this category. Deleting will unassign their category.`
    : "This cannot be undone.";

  $("#deleteCategoryOverlay").classList.add("open");
}

function initCategoryManagement() {
  $("#addCategoryBtn").onclick = () => openCategoryModal();
  $("#cancelCatModalBtn").onclick = closeCategoryModal;
  $("#categoryModalForm").addEventListener("submit", handleCategoryModalSubmit);

  $("#confirmDeleteCategoryBtn").onclick = () => {
    if (!pendingDeleteCategoryName) return;
    const categories = loadCategories().filter(c => c.name !== pendingDeleteCategoryName);
    saveCategories(categories);
    $("#deleteCategoryOverlay").classList.remove("open");
    pendingDeleteCategoryName = null;
    renderCategoriesTable();
    populateCategoriesDropdown();
    showToast("Category deleted.");
  };
  $("#cancelDeleteCategoryBtn").onclick = () => {
    pendingDeleteCategoryName = null;
    $("#deleteCategoryOverlay").classList.remove("open");
  };
}

/* ─── HERO & SECTIONS EDITOR ─────────────────────────────── */
function initHeroEditor() {
  const h = loadHero();

  // Populate hero text
  $("#hEyebrow").value    = h.eyebrow    || "";
  $("#hTitle").value      = h.title      || "";
  $("#hSubtitle").value   = h.subtitle   || "";
  $("#hBtn1").value       = h.btn1       || "";
  $("#hBtn2").value       = h.btn2       || "";
  $("#hStat1Val").value   = h.stat1Val   || "";
  $("#hStat1Label").value = h.stat1Label || "";
  $("#hStat2Val").value   = h.stat2Val   || "";
  $("#hStat2Label").value = h.stat2Label || "";
  $("#hStat3Val").value   = h.stat3Val   || "";
  $("#hStat3Label").value = h.stat3Label || "";

  // Populate Hero Photos
  if ($("#hHeroImg1")) $("#hHeroImg1").value = h.heroImage1 || "";
  if ($("#hHeroImg2")) $("#hHeroImg2").value = h.heroImage2 || "";

  // Populate Men section
  if (h.menSection) {
    $("#hMenTitle").value   = h.menSection.title    || "";
    $("#hMenSub").value     = h.menSection.subtitle || "";
    $("#hMenBtnText").value = h.menSection.btnText  || "";
    $("#hMenCats").value    = (h.menSection.categories || []).join(", ");
    $("#hMenImage").value   = h.menSection.image    || "";
  }

  // Populate Women section
  if (h.womenSection) {
    $("#hWomenTitle").value   = h.womenSection.title    || "";
    $("#hWomenSub").value     = h.womenSection.subtitle || "";
    $("#hWomenBtnText").value = h.womenSection.btnText  || "";
    $("#hWomenCats").value    = (h.womenSection.categories || []).join(", ");
    $("#hWomenImage").value   = h.womenSection.image    || "";
  }

  updateHeroLivePreview();

  // Wire live preview typing
  [
    "hEyebrow","hTitle","hSubtitle","hBtn1","hBtn2",
    "hStat1Val","hStat1Label","hStat2Val","hStat2Label","hStat3Val","hStat3Label",
    "hMenTitle","hMenSub","hWomenTitle","hWomenSub"
  ].forEach(id => {
    const el = $(`#${id}`);
    if (el) el.addEventListener("input", updateHeroLivePreview);
  });

  // ── Banner Image Upload helpers ──────────────────────────
  function wireImageUpload(btnId, fileId, urlId, previewWrapId, previewImgId) {
    const btn  = $(`#${btnId}`);
    const file = $(`#${fileId}`);
    const url  = $(`#${urlId}`);
    const wrap = $(`#${previewWrapId}`);
    const prev = $(`#${previewImgId}`);
    if (!btn || !file) return;

    // Show existing preview if URL set
    if (url && url.value) { if (wrap) wrap.style.display = "block"; if (prev) prev.src = url.value; }

    btn.onclick = () => file.click();
    file.onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        url.value = ev.target.result;
        if (wrap) wrap.style.display = "block";
        if (prev) prev.src = ev.target.result;
        showToast("Image loaded — click Save to apply.", "success");
      };
      reader.readAsDataURL(f);
      e.target.value = "";
    };
    // Also show preview when URL is pasted
    if (url) url.addEventListener("input", () => {
      const v = url.value.trim();
      if (wrap) wrap.style.display = v ? "block" : "none";
      if (prev && v) prev.src = v;
    });
  }

  wireImageUpload("hHeroImg1UploadBtn",   "hHeroImg1File",   "hHeroImg1",   "hHeroImg1Preview",   "hHeroImg1PreviewImg");
  wireImageUpload("hHeroImg2UploadBtn",   "hHeroImg2File",   "hHeroImg2",   "hHeroImg2Preview",   "hHeroImg2PreviewImg");
  wireImageUpload("hMenImageUploadBtn",   "hMenImageFile",   "hMenImage",   "hMenImagePreview",   "hMenImagePreviewImg");
  wireImageUpload("hWomenImageUploadBtn", "hWomenImageFile", "hWomenImage", "hWomenImagePreview", "hWomenImagePreviewImg");

  // Save Hero Form
  $("#heroForm").onsubmit = e => {
    e.preventDefault();
    const updatedHero = {
      eyebrow:    $("#hEyebrow").value.trim(),
      title:      $("#hTitle").value.trim(),
      subtitle:   $("#hSubtitle").value.trim(),
      btn1:       $("#hBtn1").value.trim(),
      btn2:       $("#hBtn2").value.trim(),
      stat1Val:   $("#hStat1Val").value.trim(),
      stat1Label: $("#hStat1Label").value.trim(),
      stat2Val:   $("#hStat2Val").value.trim(),
      stat2Label: $("#hStat2Label").value.trim(),
      stat3Val:   $("#hStat3Val").value.trim(),
      stat3Label: $("#hStat3Label").value.trim(),
      heroImage1: $("#hHeroImg1") ? $("#hHeroImg1").value.trim() : "",
      heroImage2: $("#hHeroImg2") ? $("#hHeroImg2").value.trim() : "",
      sectionsEnabled: true,
      menSection: {
        title:      $("#hMenTitle").value.trim() || "Men's Collection",
        subtitle:   $("#hMenSub").value.trim()   || "",
        btnText:    $("#hMenBtnText").value.trim() || "Explore Men →",
        image:      $("#hMenImage").value.trim(),
        categories: $("#hMenCats").value.split(",").map(s => s.trim()).filter(Boolean)
      },
      womenSection: {
        title:      $("#hWomenTitle").value.trim() || "Women's Collection",
        subtitle:   $("#hWomenSub").value.trim()   || "",
        btnText:    $("#hWomenBtnText").value.trim() || "Explore Women →",
        image:      $("#hWomenImage").value.trim(),
        categories: $("#hWomenCats").value.split(",").map(s => s.trim()).filter(Boolean)
      }
    };
    saveHero(updatedHero);

    $("#heroSuccess").textContent = "Hero & Collections saved! Live on storefront.";
    showToast("Hero & Sections saved ✓", "success");
    setTimeout(() => { if ($("#heroSuccess")) $("#heroSuccess").textContent = ""; }, 3500);
  };
}

function updateHeroLivePreview() {
  $("#hpEyebrow").textContent = $("#hEyebrow").value || "No sign-up. No password.";
  $("#hpTitle").innerHTML = escHtml($("#hTitle").value || "").replace(/\n/g, "<br>");
  $("#hpSub").textContent = $("#hSubtitle").value || "";
  $("#hpBtn1").textContent = $("#hBtn1").value || "Start browsing";
  $("#hpBtn2").textContent = $("#hBtn2").value || "How ordering works";
  $("#hpStat1Val").textContent = $("#hStat1Val").value || "500+";
  $("#hpStat1Label").textContent = $("#hStat1Label").value || "orders";
  $("#hpStat2Val").textContent = $("#hStat2Val").value || "64";
  $("#hpStat2Label").textContent = $("#hStat2Label").value || "districts";
  $("#hpStat3Val").textContent = $("#hStat3Val").value || "24h";
  $("#hpStat3Label").textContent = $("#hStat3Label").value || "confirmation";

  $("#previewMenTitle").textContent = $("#hMenTitle").value || "Men's Collection";
  $("#previewMenSub").textContent = $("#hMenSub").value || "";
  $("#previewWomenTitle").textContent = $("#hWomenTitle").value || "Women's Collection";
  $("#previewWomenSub").textContent = $("#hWomenSub").value || "";
}

/* ─── PRODUCT DELETE LOGIC ───────────────────────────────── */
let pendingDeleteId = null;

function openDeleteModal(id) {
  const p = loadProducts().find(prod => prod.id === id);
  if (!p) return;
  pendingDeleteId = id;
  $("#deleteProductName").textContent = `"${p.name}"`;
  $("#deleteOverlay").classList.add("open");
}

function initDeleteModals() {
  $("#confirmDeleteBtn").onclick = () => {
    if (!pendingDeleteId) return;
    const delId = pendingDeleteId;
    saveProducts(loadProducts().filter(p => p.id !== delId));
    if (window.ffSupabaseReady) {
      try {
        window.requireFfSupabase().from("products").delete().eq("id", delId).then(({ error }) => {
          if (error) console.warn("Supabase product delete notice:", error);
        });
      } catch (e) {}
    }
    selectedProductIds.delete(delId);
    pendingDeleteId = null;
    $("#deleteOverlay").classList.remove("open");
    renderProductsTable();
    showToast("Product deleted.");
  };
  $("#cancelDeleteBtn").onclick = () => {
    pendingDeleteId = null;
    $("#deleteOverlay").classList.remove("open");
  };

  // Bulk delete
  $("#confirmBulkDeleteBtn").onclick = () => {
    const toDelete = Array.from(selectedProductIds);
    saveProducts(loadProducts().filter(p => !selectedProductIds.has(p.id)));
    if (window.ffSupabaseReady && toDelete.length > 0) {
      try {
        window.requireFfSupabase().from("products").delete().in("id", toDelete).then(({ error }) => {
          if (error) console.warn("Supabase bulk delete notice:", error);
        });
      } catch (e) {}
    }
    const count = selectedProductIds.size;
    selectedProductIds.clear();
    $("#bulkDeleteOverlay").classList.remove("open");
    renderProductsTable();
    showToast(`${count} product(s) deleted.`);
  };
  $("#cancelBulkDeleteBtn").onclick = () => $("#bulkDeleteOverlay").classList.remove("open");
}

/* ─── SETTINGS & BACKUP ──────────────────────────────────── */
function renderStorageBar() {
  try {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) total += (localStorage[key].length * 2);
    }
    const mb    = (total / 1024 / 1024).toFixed(2);
    const limit = 5;
    const pct   = Math.min(100, (total / 1024 / 1024 / limit) * 100);
    $("#storageFill").style.width = pct + "%";
    $("#storageFill").style.background = pct > 80 ? "var(--red)" : pct > 60 ? "var(--amber)" : "var(--coral)";
    $("#storageText").textContent = `${mb} MB used of ~${limit} MB (${pct.toFixed(0)}%)`;
  } catch { $("#storageText").textContent = "Unable to calculate storage size."; }
}

function initSettings() {
  const s = loadSettings();
  $("#sShopName").value     = s.shopName     || "";
  $("#sWhatsapp").value     = s.whatsapp     || "";
  $("#sCurrency").value     = s.currency     || "";
  $("#sDeliveryNote").value = s.deliveryNote || "";
  if ($("#sLowStockThreshold")) $("#sLowStockThreshold").value = s.lowStockThreshold || "5";
  if (typeof updateStockSystemMasterUI === "function") {
    updateStockSystemMasterUI(s.stockSystemEnabled !== false);
  }

  // ── Logo Upload Logic ──────────────────────────────────────
  function showLogoDashPreview(url) {
    if (!url) { $("#logoPreviewWrap").style.display = "none"; $("#logoUploadInner").style.display = ""; return; }
    $("#logoDashPreview").src = url;
    $("#logoPreviewWrap").style.display = "flex";
    $("#logoUploadInner").style.display = "none";
  }
  // Load existing logo
  showLogoDashPreview(s.logoUrl || "");

  function saveLogo(dataUrl) {
    const cur = loadSettings();
    cur.logoUrl = dataUrl;
    saveSettings(cur);
    showLogoDashPreview(dataUrl);
    const msg = $("#logoSuccess");
    if (msg) { msg.textContent = "Logo saved! It will appear on the storefront."; setTimeout(() => msg.textContent = "", 3000); }
    showToast("Logo updated ✓", "success");
  }

  // File browse
  $("#logoFileBrowseBtn").onclick = () => $("#logoFileInput").click();
  $("#logoChangeBtn").onclick     = () => { $("#logoPreviewWrap").style.display = "none"; $("#logoUploadInner").style.display = ""; $("#logoFileInput").click(); };
  $("#logoFileInput").onchange    = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => saveLogo(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // URL set
  $("#logoUrlSetBtn").onclick = () => {
    const url = ($("#logoUrlInput").value || "").trim();
    if (!url) { showToast("Please enter a URL", "error"); return; }
    saveLogo(url);
    $("#logoUrlInput").value = "";
  };

  // Remove logo
  $("#logoRemoveBtn").onclick = () => {
    const cur = loadSettings(); delete cur.logoUrl; saveSettings(cur);
    showLogoDashPreview("");
    showToast("Logo removed.", "success");
  };

  // Drag & drop on logo zone
  const zone = $("#logoUploadZone");
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.style.borderColor = "var(--coral)"; });
  zone.addEventListener("dragleave", () => zone.style.borderColor = "");
  zone.addEventListener("drop", (e) => {
    e.preventDefault(); zone.style.borderColor = "";
    const file = e.dataTransfer.files[0]; if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => saveLogo(ev.target.result);
    reader.readAsDataURL(file);
  });

  // ── Settings Form Save (preserve logoUrl) ────────────────
  $("#settingsForm").onsubmit = e => {
    e.preventDefault();
    const cur = loadSettings(); // keep existing logoUrl
    const isStockActive = $("#sStockSystemMasterToggle") ? $("#sStockSystemMasterToggle").checked : (cur.stockSystemEnabled !== false);
    const saved = {
      ...cur,
      shopName:          $("#sShopName").value.trim()          || "Ferry & Fable",
      whatsapp:          $("#sWhatsapp").value.trim()          || "+880 1700000000",
      currency:          $("#sCurrency").value.trim()          || "৳",
      deliveryNote:      $("#sDeliveryNote").value.trim()      || "",
      lowStockThreshold: parseInt($("#sLowStockThreshold")?.value) || 5,
      stockSystemEnabled: isStockActive
    };
    saveSettings(saved);
    if (typeof updateStockSystemMasterUI === "function") updateStockSystemMasterUI(isStockActive);
    renderProductsTable();
    $("#settingsSuccess").textContent = "Settings saved! WhatsApp number is now " + saved.whatsapp;
    showToast("Settings saved ✓", "success");
    setTimeout(() => { if ($("#settingsSuccess")) $("#settingsSuccess").textContent = ""; }, 3500);
  };



  // Change Password
  $("#pwForm").onsubmit = async (e) => {
    e.preventDefault();
    const errEl = $("#pwError"), okEl = $("#pwSuccess");
    errEl.textContent = ""; okEl.textContent = "";

    const cur = $("#pwCurrent").value;
    const nw  = $("#pwNew").value;
    const cf  = $("#pwConfirm").value;

    const isValidCurrent = await verifyPassword(cur, getStoredHash());
    if (!isValidCurrent) { errEl.textContent = "Current password is incorrect."; return; }
    if (nw.length < 6) { errEl.textContent = "New password must be at least 6 characters."; return; }
    if (nw !== cf) { errEl.textContent = "New passwords don't match."; return; }

    const newHash = await hashPassword(nw);
    localStorage.setItem(AUTH_KEY, newHash);
    $("#pwForm").reset();
    okEl.textContent = "Password updated securely!";
    showToast("Password changed ✓", "success");
    setTimeout(() => { if (okEl) okEl.textContent = ""; }, 3500);
  };

  // Export JSON backup
  $("#exportBtn").onclick = async () => {
    let data;
    if (window.FF_DB) {
      data = await window.FF_DB.exportBackup();
    } else {
      data = {
        products: loadProducts(),
        categories: loadCategories(),
        departments: loadDepartments(),
        settings: loadSettings(),
        hero: loadHero(),
        version: "3.2"
      };
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `ferry-fable-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast("Full database backup exported ✓", "success");
  };

  // Import JSON backup
  $("#importFile").onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (window.FF_DB && data.app && data.data) {
          await window.FF_DB.importBackup(data);
          const freshProds = await window.FF_DB.getProducts();
          window.ffProductCache = freshProds;
        } else {
          const prods = Array.isArray(data) ? data : data.products;
          if (!Array.isArray(prods)) throw new Error("Invalid structure");
          saveProducts(prods);
          if (data.categories)  saveCategories(data.categories);
          if (data.departments) saveDepartments(data.departments);
          if (data.settings)    saveSettings(data.settings);
          if (data.hero)        saveHero(data.hero);
        }

        populateDepartmentsDropdowns();
        renderDepartmentsTable();
        renderProductsTable();
        renderCategoriesTable();
        renderStorageBar();
        if (typeof initDatabaseHub === "function") initDatabaseHub();
        $("#importSuccess").textContent = "Backup imported and database restored successfully!";
        showToast("Backup restored ✓", "success");
        setTimeout(() => { if ($("#importSuccess")) $("#importSuccess").textContent = ""; }, 4000);
      } catch (err) {
        $("#importError").textContent = "Failed to parse JSON file.";
        showToast("Invalid JSON file", "error");
        setTimeout(() => { if ($("#importError")) $("#importError").textContent = ""; }, 4000);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  // Clear Demo Catalog
  if ($("#clearCatalogBtn")) {
    $("#clearCatalogBtn").onclick = async () => {
      if (!confirm("Are you sure you want to clear all demo products? Your catalog will be completely empty, ready for you to upload your real client products.")) return;

      if (window.FF_DB) {
        await window.FF_DB.clearCatalog();
      }
      if (window.ffSupabaseReady && window.ffSupabase) {
        try {
          const client = window.requireFfSupabase();
          await client.from("product_variants").delete().neq("id", "none");
          await client.from("products").delete().neq("id", "none");
        } catch (e) {
          console.warn("Supabase clear catalog notice:", e);
        }
      }
      saveProducts([]);
      window.ffProductCache = [];
      renderProductsTable();
      renderStorageBar();
      if (typeof initDatabaseHub === "function") initDatabaseHub();
      showToast("Catalog cleared! Store is ready for real products ✓", "success");
    };
  }

  // Reset to Defaults
  $("#resetBtn").onclick = async () => {
    if (!confirm("Reset database to defaults? Your custom products, orders, categories and settings will be refreshed with the starter catalog.")) return;
    if (window.FF_DB) {
      await window.FF_DB.resetToDemoData();
      window.ffProductCache = await window.FF_DB.getProducts();
      window.ffOrdersCache = await window.FF_DB.getOrders();
    }
    saveProducts(PRODUCTS);
    saveCategories(DEFAULT_CATEGORIES);
    if (typeof DEFAULT_DEPARTMENTS !== "undefined") saveDepartments(DEFAULT_DEPARTMENTS);
    localStorage.removeItem(HERO_KEY);
    populateDepartmentsDropdowns();
    renderDepartmentsTable();
    renderProductsTable();
    renderCategoriesTable();
    renderStorageBar();
    if (typeof initDatabaseHub === "function") initDatabaseHub();
    showToast("Database reset to defaults.");
  };

  initDatabaseHub();
}

/* ─── INITIALIZATION ─────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  if (window.FF_DB) {
    try {
      await window.FF_DB.init();
      const prods = await window.FF_DB.getProducts();
      if (prods && prods.length > 0) {
        window.ffProductCache = prods;
      }
      const ords = await window.FF_DB.getOrders();
      if (ords) {
        window.ffOrdersCache = ords.map(o => ({
          id: o.order_number || o.id,
          date: o.created_at,
          customer: o.customer,
          payment: o.payment_method || "Cash on Delivery",
          items: o.items,
          total: o.total,
          status: o.status,
          paymentStatus: o.payment_status
        }));
      }
    } catch (e) {
      console.warn("FF_DB initialization warning:", e);
    }
  }

  const version = localStorage.getItem("ff_catalog_version");
  if (!version || version !== "3.2") {
    if (typeof PRODUCTS !== "undefined") saveProducts(PRODUCTS);
    if (typeof DEFAULT_CATEGORIES !== "undefined") saveCategories(DEFAULT_CATEGORIES);
    if (typeof DEFAULT_DEPARTMENTS !== "undefined") saveDepartments(DEFAULT_DEPARTMENTS);
    localStorage.setItem("ff_catalog_version", "3.2");
  }

  await initAuth();

  if (isLoggedIn()) {
    setupDashboard();
  }
});

function setupDashboard() {
  initNav();
  initMobileNav();
  populateDepartmentsDropdowns();
  renderDepartmentsTable();
  initTableFilters();
  initMainImageUpload();
  initExtraImagesUpload();
  initSizesAndColorsManagers();
  initLivePreviewListeners();
  initCategoryManagement();
  initDeleteModals();
  initSettings();
  initStockEntryHandlers();
  initStockAdjustModal();
  initStockHistoryModal();

  // Department modal actions
  if ($("#addDepartmentBtn")) $("#addDepartmentBtn").onclick = () => openDepartmentModal();
  if ($("#departmentModalForm")) $("#departmentModalForm").onsubmit = handleDepartmentModalSubmit;
  if ($("#cancelDeptModalBtn")) $("#cancelDeptModalBtn").onclick = closeDepartmentModal;

  // Form submit
  $("#productForm").addEventListener("submit", handleProductFormSubmit);

  // Keyboard shortcut (Escape closes modals)
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      $("#deleteOverlay").classList.remove("open");
      $("#deleteCategoryOverlay").classList.remove("open");
      $("#bulkDeleteOverlay").classList.remove("open");
      $("#categoryModal").classList.remove("open");
      $("#departmentModal").classList.remove("open");
      closeSidebar();
    }
  });

  // Start on products view
  showView("products");
}

/* ============================================================
   DATABASE & CLOUD SYNC HUB
   ============================================================ */
async function initDatabaseHub() {
  if (!$("#dbHubCard")) return;

  async function refreshDbStats() {
    if (window.FF_DB) {
      try {
        const [prods, orders, history] = await Promise.all([
          window.FF_DB.getProducts(),
          window.FF_DB.getOrders(),
          window.FF_DB.getStockHistory(1000)
        ]);
        let totalVariants = 0;
        prods.forEach(p => {
          const vCount = Object.keys(p.variantStock || {}).length;
          totalVariants += (vCount > 0 ? vCount : 1);
        });

        if ($("#dbStatProducts")) $("#dbStatProducts").textContent = prods.length;
        if ($("#dbStatVariants")) $("#dbStatVariants").textContent = totalVariants;
        if ($("#dbStatOrders")) $("#dbStatOrders").textContent = orders.length;
        if ($("#dbStatHistory")) $("#dbStatHistory").textContent = history.length;
      } catch (e) {
        console.warn("Could not load DB stats", e);
      }
    }

    const badge = $("#dbStatusBadge");
    if (badge) {
      if (window.ffSupabaseReady && window.ffSupabase) {
        badge.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block"></span><span>Supabase Cloud Connected 🚀</span>`;
        badge.style.background = "#ecfdf5";
        badge.style.color = "#065f46";
        badge.style.borderColor = "#a7f3d0";
        if ($("#sbDisconnectBtn")) $("#sbDisconnectBtn").style.display = "inline-flex";
      } else {
        badge.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block"></span><span>IndexedDB Active (Local)</span>`;
        badge.style.background = "#f0fdf4";
        badge.style.color = "#166534";
        badge.style.borderColor = "#bbf7d0";
        if ($("#sbDisconnectBtn")) $("#sbDisconnectBtn").style.display = "none";
      }
    }
  }

  await refreshDbStats();

  // Load saved credentials into inputs (or pre-configured project credentials)
  let savedConfig = {};
  try {
    savedConfig = JSON.parse(localStorage.getItem("ff_supabase_config") || "{}");
  } catch(e) {}
  const activeUrl = savedConfig.url || window.FF_SUPABASE_URL || "https://atphxpjqmxbrsqqdaxtd.supabase.co";
  const activeKey = savedConfig.anonKey || window.FF_SUPABASE_ANON_KEY || "sb_publishable_Ahwsy4O8J39kLkUiaT5dQQ_PdEBkV2x";
  if ($("#sbUrlInput")) $("#sbUrlInput").value = activeUrl;
  if ($("#sbKeyInput")) $("#sbKeyInput").value = activeKey;

  // Test Supabase Connection button
  if ($("#sbTestBtn")) {
    $("#sbTestBtn").onclick = async () => {
      const url = ($("#sbUrlInput")?.value || "").trim();
      const key = ($("#sbKeyInput")?.value || "").trim();
      const resultEl = $("#sbTestResult");
      if (!resultEl) return;

      resultEl.textContent = "Testing connection to Supabase...";
      resultEl.style.color = "#6366f1";

      if (typeof window.testSupabaseConnection === "function") {
        const res = await window.testSupabaseConnection(url, key);
        if (res.ok) {
          resultEl.textContent = res.tablesReady
            ? "✅ " + (res.message || "Connection successful! Database tables are ready.")
            : "⚠️ " + (res.message || "Connected to Supabase! Please run supabase-schema.sql in your Supabase SQL Editor.");
          resultEl.style.color = res.tablesReady ? "#16a34a" : "#d97706";
        } else {
          resultEl.textContent = "❌ Connection failed: " + (res.error || "Unreachable");
          resultEl.style.color = "#dc2626";
        }
      } else {
        resultEl.textContent = "Connection test helper not loaded.";
        resultEl.style.color = "#dc2626";
      }
    };
  }

  // Save & Connect Supabase button
  if ($("#sbSaveBtn")) {
    $("#sbSaveBtn").onclick = async () => {
      const url = ($("#sbUrlInput")?.value || "").trim();
      const key = ($("#sbKeyInput")?.value || "").trim();
      const resultEl = $("#sbTestResult");

      if (!url || !key) {
        if (resultEl) {
          resultEl.textContent = "Please provide both Supabase URL and public anon key.";
          resultEl.style.color = "#dc2626";
        }
        return;
      }

      const testRes = await window.testSupabaseConnection(url, key);
      if (!testRes.ok) {
        if (resultEl) {
          resultEl.textContent = "Cannot save invalid connection: " + testRes.error;
          resultEl.style.color = "#dc2626";
        }
        return;
      }

      localStorage.setItem("ff_supabase_config", JSON.stringify({ url, anonKey: key }));
      window.FF_SUPABASE_URL = url;
      window.FF_SUPABASE_ANON_KEY = key;
      if (window.supabase) {
        window.ffSupabase = window.supabase.createClient(url, key);
        window.ffSupabaseReady = true;
      }

      // Load live catalog directly from Supabase (clean state, 0 demo products)
      if (typeof window.ffLoadCatalog === "function") {
        window.ffProductCache = await window.ffLoadCatalog();
      }

      if (resultEl) {
        resultEl.textContent = "🎉 Connected to Supabase Cloud! Using clean cloud database.";
        resultEl.style.color = "#16a34a";
      }
      showToast("Supabase connected ✓", "success");
      renderProductsTable();
      await refreshDbStats();
    };
  }

  // Disconnect Cloud button
  if ($("#sbDisconnectBtn")) {
    $("#sbDisconnectBtn").onclick = () => {
      if (!confirm("Disconnect Supabase Cloud? The dashboard will revert to your fast local IndexedDB database.")) return;
      localStorage.removeItem("ff_supabase_config");
      window.FF_SUPABASE_URL = "";
      window.FF_SUPABASE_ANON_KEY = "";
      window.ffSupabaseReady = false;
      window.ffSupabase = null;
      if ($("#sbUrlInput")) $("#sbUrlInput").value = "";
      if ($("#sbKeyInput")) $("#sbKeyInput").value = "";
      if ($("#sbTestResult")) $("#sbTestResult").textContent = "";
      showToast("Reverted to Local IndexedDB ✓", "success");
      refreshDbStats();
    };
  }

  // Listen to cross-tab updates from customer storefront (new orders, stock deduction)
  if (window.FF_DB && !window._ffDbHubListening) {
    window._ffDbHubListening = true;
    window.FF_DB.on("ORDER_PLACED", (data) => {
      showToast(`🔔 New Order #${data.orderNumber} placed by ${data.order?.customer?.name || "Customer"}!`, "success");
      refreshDbStats();
      if (currentView === "orders") renderOrdersView();
      if (currentView === "overview") renderOverview();
    });
    window.FF_DB.on("STOCK_CHANGED", () => {
      refreshDbStats();
      if (currentView === "products") renderProductsTable();
    });
    window.FF_DB.on("PRODUCTS_CHANGED", () => {
      refreshDbStats();
      if (currentView === "products") renderProductsTable();
    });
  }
}

/* ============================================================
   STOCK ADJUSTMENT MODAL
   ============================================================ */
let _stockAdjustProductId = null;

function openStockAdjustModal(productId) {
  if (typeof ensureProductStock !== "function") {
    showToast("Stock engine not loaded.", "error");
    return;
  }
  const allProds = JSON.parse(localStorage.getItem("ff_products") || "[]");
  const p = allProds.find(x => x.id === productId);
  if (!p) return;

  ensureProductStock(p);
  _stockAdjustProductId = productId;

  const overlay = $("#stockAdjustOverlay");
  if (!overlay) return;

  $("#stockAdjustTitle").textContent = `📦 ${p.name}`;

  // Build variant dropdown
  const variantSel = $("#stockAdjustVariant");
  const variants = [];
  if (p.variantStock && typeof p.variantStock === "object") {
    Object.keys(p.variantStock).forEach(key => {
      const parts = key.split("__");
      const label = key === "default" ? "Default (no variants)" : [parts[1], parts[0]].filter(Boolean).join(" / ");
      variants.push({ key, label });
    });
  }
  if (variants.length === 0) variants.push({ key: "default", label: "Default" });
  variantSel.innerHTML = variants.map(v => `<option value="${v.key}">${v.label}</option>`).join("");

  renderStockAdjustGrid(p);
  $("#stockAdjustAmount").value = 1;
  overlay.classList.add("open");
}

function renderStockAdjustGrid(p) {
  const grid = $("#stockAdjustGrid");
  if (!grid || !p.variantStock) return;
  const allOrders = JSON.parse(localStorage.getItem("ff_orders") || "[]");
  const rows = Object.entries(p.variantStock).map(([key, actual]) => {
    const reserved = allOrders
      .filter(o => o.status === "pending")
      .reduce((sum, o) => {
        (o.items || []).forEach(it => {
          if (it.id === p.id && makeVariantKey(it.size || "", it.color || "") === key) {
            sum += (it.qty || 0);
          }
        });
        return sum;
      }, 0);
    const avail = Math.max(0, actual - reserved);
    const label = key === "default" ? "Default" : key.split("__").reverse().join(" / ");
    return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9">
      <span><b>${label}</b></span>
      <span>Avail: <b>${avail}</b> &nbsp;Act: ${actual} &nbsp;Res: ${reserved}</span>
    </div>`;
  });
  grid.innerHTML = rows.join("");
}

function closeStockAdjustModal() {
  const overlay = $("#stockAdjustOverlay");
  if (overlay) overlay.classList.remove("open");
  _stockAdjustProductId = null;
}

function applyStockAdjust(delta) {
  if (!_stockAdjustProductId) return;
  const amount     = parseInt($("#stockAdjustAmount").value) || 1;
  const reason     = $("#stockAdjustReason").value || "Manual Add";
  const variantKey = $("#stockAdjustVariant").value || "default";

  // Parse variant key back to size / color using the engine helper
  const { size, color } = (typeof parseVariantKey === "function")
    ? parseVariantKey(variantKey)
    : { size: "", color: "" };

  // adjustProductStock(productId, size, color, delta, reason, actor)
  // It internally loads, updates, and saves the ff_products list
  const result = adjustProductStock(_stockAdjustProductId, size, color, delta * amount, reason, "Admin");
  if (!result) {
    showToast("Stock adjustment failed.", "error");
    return;
  }

  // Re-read updated product for the grid
  const allProds = JSON.parse(localStorage.getItem("ff_products") || "[]");
  const updated = allProds.find(x => x.id === _stockAdjustProductId);
  if (updated) renderStockAdjustGrid(updated);

  renderProductsTable();

  const sign = delta > 0 ? "+" : "";
  showToast(`${sign}${delta * amount} stock applied ✓`, "success");
}

function initStockAdjustModal() {
  const overlay = $("#stockAdjustOverlay");
  if (!overlay) return;
  if ($("#stockAdjustCancelBtn")) $("#stockAdjustCancelBtn").onclick = closeStockAdjustModal;
  if ($("#stockAdjustAddBtn"))    $("#stockAdjustAddBtn").onclick    = () => applyStockAdjust(+1);
  if ($("#stockAdjustRemoveBtn")) $("#stockAdjustRemoveBtn").onclick = () => applyStockAdjust(-1);
  if ($("#stockAdjustDecBtn"))    $("#stockAdjustDecBtn").onclick    = () => {
    const el = $("#stockAdjustAmount");
    el.value = Math.max(1, parseInt(el.value || 1) - 1);
  };
  if ($("#stockAdjustIncBtn"))    $("#stockAdjustIncBtn").onclick    = () => {
    const el = $("#stockAdjustAmount");
    el.value = parseInt(el.value || 1) + 1;
  };
  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeStockAdjustModal();
  });
}

/* ============================================================
   STOCK HISTORY MODAL
   ============================================================ */
function openStockHistoryModal() {
  const overlay = $("#stockHistoryOverlay");
  if (!overlay) return;
  renderStockHistoryTable();
  overlay.classList.add("open");
}

function closeStockHistoryModal() {
  const overlay = $("#stockHistoryOverlay");
  if (overlay) overlay.classList.remove("open");
}

function renderStockHistoryTable() {
  const tbody = $("#stockHistoryBody");
  if (!tbody || typeof loadStockHistory !== "function") return;

  const searchTerm = ($("#stockHistorySearch")?.value || "").toLowerCase();
  const filterAction = $("#stockHistoryFilter")?.value || "";

  let records = loadStockHistory();
  if (searchTerm) {
    records = records.filter(r =>
      (r.productName || "").toLowerCase().includes(searchTerm) ||
      (r.variantKey  || "").toLowerCase().includes(searchTerm)
    );
  }
  if (filterAction) {
    records = records.filter(r => (r.action || "").includes(filterAction));
  }

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8">No records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(r => {
    const dt = r.timestamp ? new Date(r.timestamp).toLocaleString("en-BD", { dateStyle: "short", timeStyle: "short" }) : "—";
    const varLabel = (!r.variantKey || r.variantKey === "default")
      ? ""
      : ` <small style="color:#64748b">(${r.variantKey.split("__").reverse().join(" / ")})</small>`;
    const delta = r.delta ?? 0;
    const afterStock = r.newStock ?? "—";
    const changeColor = delta >= 0 ? "#16a34a" : "#dc2626";
    const changeSign  = delta > 0 ? "+" : "";
    const actionLabel = r.action === "manual_adjustment" ? (r.reason || "Manual") : (r.action || "—");
    return `<tr>
      <td style="padding:8px;white-space:nowrap">${dt}</td>
      <td style="padding:8px">${r.productName || r.productId || "—"}${varLabel}</td>
      <td style="padding:8px">${actionLabel}</td>
      <td style="padding:8px;text-align:right;font-weight:700;color:${changeColor}">${changeSign}${delta}</td>
      <td style="padding:8px;text-align:right">${afterStock}</td>
      <td style="padding:8px">${r.actor || "—"}</td>
    </tr>`;
  }).join("");
}

function initStockHistoryModal() {
  if ($("#stockHistoryCloseBtn")) $("#stockHistoryCloseBtn").onclick = closeStockHistoryModal;
  if ($("#stockHistorySearch"))   $("#stockHistorySearch").oninput   = renderStockHistoryTable;
  if ($("#stockHistoryFilter"))   $("#stockHistoryFilter").onchange  = renderStockHistoryTable;
  if ($("#stockHistoryClearBtn")) {
    $("#stockHistoryClearBtn").onclick = () => {
      if (!confirm("Clear all stock history? This cannot be undone.")) return;
      if (typeof clearStockHistory === "function") clearStockHistory();
      renderStockHistoryTable();
      showToast("Stock history cleared.", "success");
    };
  }
  const overlay = $("#stockHistoryOverlay");
  if (overlay) overlay.addEventListener("click", e => {
    if (e.target === overlay) closeStockHistoryModal();
  });
}

/* ── Wire stock modals on DOMContentLoaded ──────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  initStockAdjustModal();
  initStockHistoryModal();
  initStockEntryHandlers();
});


