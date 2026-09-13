/* ============================================================
   FERRY & FABLE — UNIFIED DATABASE ENGINE (ff-db.js)
   Zero-setup, persistent IndexedDB engine with cross-tab sync,
   atomic inventory deductions, full CRUD, and optional Supabase sync.
   ============================================================ */

(function (window) {
  "use strict";

  const DB_NAME = "FerryFableDB";
  const DB_VERSION = 1;

  // Broadcast channel for real-time cross-tab synchronization
  let broadcastChannel = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      broadcastChannel = new BroadcastChannel("ff_ecom_channel");
    }
  } catch (e) {
    console.warn("BroadcastChannel not supported", e);
  }

  const listeners = new Map();

  function emit(eventType, payload) {
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({ type: eventType, payload, timestamp: Date.now() });
      } catch (e) {}
    }
    dispatchLocal(eventType, payload);
  }

  function dispatchLocal(eventType, payload) {
    const cbs = listeners.get(eventType) || [];
    cbs.forEach(cb => {
      try { cb(payload); } catch (err) { console.error("Event handler error:", err); }
    });
  }

  if (broadcastChannel) {
    broadcastChannel.onmessage = (event) => {
      if (event.data && event.data.type) {
        dispatchLocal(event.data.type, event.data.payload);
      }
    };
  }

  // --- IndexedDB Core Wrapper ---
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = req.result;

        // Products store
        if (!db.objectStoreNames.contains("products")) {
          const productStore = db.createObjectStore("products", { keyPath: "id" });
          productStore.createIndex("department", "department", { unique: false });
          productStore.createIndex("category", "category", { unique: false });
          productStore.createIndex("status", "status", { unique: false });
          productStore.createIndex("created_at", "created_at", { unique: false });
        }

        // Product Variants store
        if (!db.objectStoreNames.contains("variants")) {
          const variantStore = db.createObjectStore("variants", { keyPath: "id" });
          variantStore.createIndex("product_id", "product_id", { unique: false });
          variantStore.createIndex("product_key", ["product_id", "size", "color"], { unique: true });
        }

        // Orders store
        if (!db.objectStoreNames.contains("orders")) {
          const orderStore = db.createObjectStore("orders", { keyPath: "id" });
          orderStore.createIndex("order_number", "order_number", { unique: true });
          orderStore.createIndex("status", "status", { unique: false });
          orderStore.createIndex("created_at", "created_at", { unique: false });
        }

        // Order Items store
        if (!db.objectStoreNames.contains("order_items")) {
          const itemsStore = db.createObjectStore("order_items", { keyPath: "id" });
          itemsStore.createIndex("order_id", "order_id", { unique: false });
          itemsStore.createIndex("product_id", "product_id", { unique: false });
        }

        // Stock Audit History store
        if (!db.objectStoreNames.contains("stock_history")) {
          const historyStore = db.createObjectStore("stock_history", { keyPath: "id" });
          historyStore.createIndex("product_id", "product_id", { unique: false });
          historyStore.createIndex("created_at", "created_at", { unique: false });
        }

        // Settings store
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return dbPromise;
  }

  function tx(storeNames, mode = "readonly") {
    return openDB().then(db => {
      const transaction = db.transaction(storeNames, mode);
      return { db, transaction };
    });
  }

  function getAll(storeName) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const trans = db.transaction(storeName, "readonly");
        const store = trans.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    });
  }

  function getByKey(storeName, key) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const trans = db.transaction(storeName, "readonly");
        const store = trans.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  }

  function putItem(storeName, item) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const trans = db.transaction(storeName, "readwrite");
        const store = trans.objectStore(storeName);
        const req = store.put(item);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  }

  function deleteItem(storeName, key) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const trans = db.transaction(storeName, "readwrite");
        const store = trans.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    });
  }

  function clearStore(storeName) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const trans = db.transaction(storeName, "readwrite");
        const store = trans.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    });
  }

  // --- Seed Initial Catalog & Settings ---
  async function seedDatabaseIfEmpty() {
    const initialized = await getByKey("settings", "db_initialized");
    if (initialized) {
      return; // Already initialized or catalog explicitly cleared; do not re-seed demo data
    }
    const existing = await getAll("products");
    if (existing.length > 0) {
      await putItem("settings", { key: "db_initialized", value: true, updated_at: new Date().toISOString() });
      return; // Already initialized
    }

    const { db, transaction } = await tx(["products", "variants", "settings"], "readwrite");
    const pStore = transaction.objectStore("products");
    const vStore = transaction.objectStore("variants");
    const sStore = transaction.objectStore("settings");

    // 1. Seed Products from PRODUCTS array
    const defaultCatalog = typeof PRODUCTS !== "undefined" ? PRODUCTS : [];
    for (const prod of defaultCatalog) {
      const images = [prod.image, ...(prod.extraImages || [])].filter(Boolean);
      const isOut = prod.stock === "out_of_stock";

      const productRecord = {
        id: prod.id,
        name: prod.name,
        department: prod.department || "All",
        category: prod.category || "",
        subcategory: prod.subcategory || "",
        price: Number(prod.price) || 0,
        old_price: prod.oldPrice != null ? Number(prod.oldPrice) : null,
        images: images,
        image: images[0] || "",
        extraImages: images.slice(1),
        description: prod.description || "",
        tag: prod.tag || "",
        status: prod.stock || "in_stock",
        track_stock: prod.trackStock !== false,
        low_stock_threshold: prod.lowStockThreshold || 5,
        sizes: prod.sizes || [],
        colors: prod.colors || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      pStore.put(productRecord);

      // Create variants
      const sizes = prod.sizes && prod.sizes.length ? prod.sizes : [""];
      const colors = prod.colors && prod.colors.length ? prod.colors : [""];

      for (const size of sizes) {
        for (const color of colors) {
          const varId = `var_${prod.id}_${size}_${color}`.replace(/\s+/g, "-");
          vStore.put({
            id: varId,
            product_id: prod.id,
            size: size,
            color: color,
            stock_quantity: isOut ? 0 : 25,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }
    }

    // 2. Seed Default Settings
    const defaultSettings = {
      shopName: "Ferry & Fable",
      whatsapp: "+880 1700000000",
      currency: "৳",
      deliveryNote: "Delivery fee is confirmed at checkout based on your address.",
      lowStockThreshold: 5,
      stockSystemEnabled: true,
      logoUrl: ""
    };
    sStore.put({ key: "storefront", value: defaultSettings, updated_at: new Date().toISOString() });

    // 3. Seed Default Departments & Categories
    if (typeof DEFAULT_DEPARTMENTS !== "undefined") {
      sStore.put({ key: "departments", value: DEFAULT_DEPARTMENTS, updated_at: new Date().toISOString() });
    }
    if (typeof DEFAULT_CATEGORIES !== "undefined") {
      sStore.put({ key: "categories", value: DEFAULT_CATEGORIES, updated_at: new Date().toISOString() });
    }

    // 4. Seed Default Hero Section
    const defaultHero = {
      eyebrow: "No sign-up. No password. Just shopping.",
      title: "Things you actually\nneed, at prices that\nmake sense.",
      subtitle: "Browse the catalog, drop what you like into your bag, and check out in one message. Cash on delivery available across Bangladesh.",
      btn1: "Start browsing",
      btn2: "How ordering works",
      stat1Val: "500+",
      stat1Label: "orders delivered",
      stat2Val: "64",
      stat2Label: "districts reached",
      stat3Val: "24h",
      stat3Label: "order confirmation",
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
    sStore.put({ key: "hero", value: defaultHero, updated_at: new Date().toISOString() });
    sStore.put({ key: "db_initialized", value: true, updated_at: new Date().toISOString() });

    await new Promise((res, rej) => {
      transaction.oncomplete = res;
      transaction.onerror = rej;
    });

    console.log("Ferry & Fable Database initialized and seeded with catalog.");
  }

  // Helper to construct variant key
  function makeVariantKey(size, color) {
    return `${(size || "").trim()}__${(color || "").trim()}`;
  }

  // --- Public Database API ---
  const Database = {
    init: async function () {
      await openDB();
      await seedDatabaseIfEmpty();
      return true;
    },

    // --- PRODUCTS & VARIANTS ---
    getProducts: async function () {
      const [products, variants] = await Promise.all([
        getAll("products"),
        getAll("variants")
      ]);

      return products.map(prod => {
        const prodVariants = variants.filter(v => v.product_id === prod.id);
        const variantStock = {};
        const variantIds = {};

        prodVariants.forEach(v => {
          const key = makeVariantKey(v.size, v.color);
          variantStock[key] = Number(v.stock_quantity) || 0;
          variantIds[key] = v.id;
        });

        const images = Array.isArray(prod.images) && prod.images.length > 0
          ? prod.images
          : [prod.image, ...(prod.extraImages || [])].filter(Boolean);

        return {
          id: prod.id,
          name: prod.name,
          department: prod.department || "All",
          category: prod.category || "",
          subcategory: prod.subcategory || "",
          price: Number(prod.price) || 0,
          oldPrice: prod.old_price != null ? Number(prod.old_price) : (prod.oldPrice != null ? Number(prod.oldPrice) : undefined),
          image: images[0] || "",
          extraImages: images.slice(1),
          images: images,
          tag: prod.tag || "",
          stock: prod.status || prod.stock || "in_stock",
          description: prod.description || "",
          trackStock: prod.track_stock !== false,
          lowStockThreshold: prod.low_stock_threshold || 5,
          sizes: prod.sizes || [...new Set(prodVariants.map(v => v.size).filter(Boolean))],
          colors: prod.colors || [...new Set(prodVariants.map(v => v.color).filter(Boolean))],
          variantStock,
          _variantIds: variantIds
        };
      });
    },

    getProduct: async function (productId) {
      const products = await this.getProducts();
      return products.find(p => p.id === productId) || null;
    },

    saveProduct: async function (productData) {
      const id = productData.id || `p_${Date.now().toString(36)}`;
      const images = [productData.image, ...(productData.extraImages || [])].filter(Boolean);

      const productRecord = {
        id: id,
        name: productData.name,
        department: productData.department || "All",
        category: productData.category || "",
        subcategory: productData.subcategory || "",
        price: Number(productData.price) || 0,
        old_price: productData.oldPrice != null ? Number(productData.oldPrice) : null,
        images: images,
        image: images[0] || "",
        extraImages: images.slice(1),
        description: productData.description || "",
        tag: productData.tag || "",
        status: productData.stock || "in_stock",
        track_stock: productData.trackStock !== false,
        low_stock_threshold: productData.lowStockThreshold || 5,
        sizes: productData.sizes || [],
        colors: productData.colors || [],
        updated_at: new Date().toISOString()
      };

      const { db, transaction } = await tx(["products", "variants"], "readwrite");
      const pStore = transaction.objectStore("products");
      const vStore = transaction.objectStore("variants");

      pStore.put(productRecord);

      // Update / insert variants
      const sizes = productData.sizes && productData.sizes.length ? productData.sizes : [""];
      const colors = productData.colors && productData.colors.length ? productData.colors : [""];

      for (const size of sizes) {
        for (const color of colors) {
          const key = makeVariantKey(size, color);
          const varId = productData._variantIds?.[key] || `var_${id}_${size}_${color}`.replace(/\s+/g, "-");
          const existingStock = productData.variantStock?.[key] != null
            ? Number(productData.variantStock[key])
            : 20;

          vStore.put({
            id: varId,
            product_id: id,
            size: size,
            color: color,
            stock_quantity: Math.max(0, existingStock),
            updated_at: new Date().toISOString()
          });
        }
      }

      await new Promise((res, rej) => {
        transaction.oncomplete = res;
        transaction.onerror = rej;
      });

      emit("PRODUCTS_CHANGED", { productId: id });
      return id;
    },

    deleteProduct: async function (productId) {
      const { db, transaction } = await tx(["products", "variants", "stock_history"], "readwrite");
      transaction.objectStore("products").delete(productId);

      // Clean up variants
      const vStore = transaction.objectStore("variants");
      const vReq = vStore.getAll();
      vReq.onsuccess = () => {
        const variants = vReq.result || [];
        variants.filter(v => v.product_id === productId).forEach(v => vStore.delete(v.id));
      };

      await new Promise((res, rej) => {
        transaction.oncomplete = res;
        transaction.onerror = rej;
      });

      emit("PRODUCTS_CHANGED", { productId });
      return true;
    },

    // --- STOCK & INVENTORY ENGINE ---
    adjustStock: async function (variantId, delta, reason = "Manual adjustment", action = "manual_adjustment") {
      const { db, transaction } = await tx(["variants", "stock_history"], "readwrite");
      const vStore = transaction.objectStore("variants");
      const hStore = transaction.objectStore("stock_history");

      const variant = await new Promise((res, rej) => {
        const req = vStore.get(variantId);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });

      if (!variant) throw new Error("Variant not found");

      const prevQty = Number(variant.stock_quantity) || 0;
      const newQty = Math.max(0, prevQty + Number(delta));

      variant.stock_quantity = newQty;
      variant.updated_at = new Date().toISOString();
      vStore.put(variant);

      // Record audit history
      const historyItem = {
        id: `sh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        product_id: variant.product_id,
        variant_id: variant.id,
        variant_label: `${variant.size || ""} ${variant.color || ""}`.trim() || "Default",
        previous_quantity: prevQty,
        new_quantity: newQty,
        quantity_change: Number(delta),
        action: action,
        reason: reason,
        created_at: new Date().toISOString()
      };
      hStore.put(historyItem);

      await new Promise((res, rej) => {
        transaction.oncomplete = res;
        transaction.onerror = rej;
      });

      emit("STOCK_CHANGED", { variantId, productId: variant.product_id, newQty });
      return { variant, historyItem };
    },

    getStockHistory: async function (limit = 100) {
      const history = await getAll("stock_history");
      return history
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, limit);
    },

    clearStockHistory: async function () {
      await clearStore("stock_history");
      emit("STOCK_CHANGED", {});
      return true;
    },

    // --- ATOMIC ORDER PLACEMENT ---
    placeOrder: async function (customer, items, paymentMethod = "cod", notes = "") {
      if (!customer || !customer.name || !customer.phone || !customer.address) {
        throw new Error("Customer name, phone, and delivery address are required.");
      }
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("Cannot place an empty order. Please add products to your bag.");
      }

      const orderNumber = "ORD-" + Math.floor(100000 + Math.random() * 900000);
      const trackingToken = crypto.randomUUID ? crypto.randomUUID() : `tk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const { db, transaction } = await tx(["products", "variants", "orders", "order_items", "stock_history"], "readwrite");
      const pStore = transaction.objectStore("products");
      const vStore = transaction.objectStore("variants");
      const oStore = transaction.objectStore("orders");
      const iStore = transaction.objectStore("order_items");
      const hStore = transaction.objectStore("stock_history");

      const allVariants = await new Promise(res => {
        const req = vStore.getAll();
        req.onsuccess = () => res(req.result || []);
      });
      const allProducts = await new Promise(res => {
        const req = pStore.getAll();
        req.onsuccess = () => res(req.result || []);
      });

      let subtotal = 0;
      const orderLineItems = [];

      // Check stock availability atomically
      for (const item of items) {
        const qty = Number(item.qty) || 1;
        const product = allProducts.find(p => p.id === item.id);
        if (!product) throw new Error(`Product ${item.name || item.id} is no longer available.`);

        let variant = allVariants.find(v =>
          v.product_id === product.id &&
          (v.size || "").trim() === (item.size || "").trim() &&
          (v.color || "").trim() === (item.color || "").trim()
        );

        if (!variant) {
          variant = allVariants.find(v => v.product_id === product.id) || {
            id: `var_${product.id}_default`,
            product_id: product.id,
            size: item.size || "",
            color: item.color || "",
            stock_quantity: 99
          };
        }

        if (product.track_stock !== false) {
          if (variant.stock_quantity < qty) {
            throw new Error(`Insufficient stock for "${product.name}" (${item.size || ""} ${item.color || ""}). Only ${variant.stock_quantity} available.`);
          }
          // Deduct stock
          const prevQty = variant.stock_quantity;
          variant.stock_quantity = Math.max(0, variant.stock_quantity - qty);
          variant.updated_at = new Date().toISOString();
          vStore.put(variant);

          // Record stock history audit
          hStore.put({
            id: `sh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            product_id: product.id,
            variant_id: variant.id,
            variant_label: `${item.size || ""} ${item.color || ""}`.trim() || "Default",
            previous_quantity: prevQty,
            new_quantity: variant.stock_quantity,
            quantity_change: -qty,
            action: "Sold",
            reason: `Order placed: #${orderNumber}`,
            order_id: orderId,
            created_at: new Date().toISOString()
          });
        }

        const unitPrice = Number(product.price) || Number(item.price) || 0;
        const lineTotal = unitPrice * qty;
        subtotal += lineTotal;

        const lineItemRecord = {
          id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          order_id: orderId,
          order_number: orderNumber,
          product_id: product.id,
          variant_id: variant.id,
          name: product.name,
          size: item.size || "",
          color: item.color || "",
          qty: qty,
          price: unitPrice,
          line_total: lineTotal
        };
        iStore.put(lineItemRecord);
        orderLineItems.push(lineItemRecord);
      }

      const total = subtotal;

      const orderRecord = {
        id: orderId,
        order_number: orderNumber,
        tracking_token: trackingToken,
        customer: {
          name: customer.name.trim(),
          phone: customer.phone.trim(),
          address: customer.address.trim()
        },
        items: orderLineItems,
        subtotal: subtotal,
        total: total,
        status: "pending",
        payment_status: "unpaid",
        payment_method: paymentMethod,
        notes: notes || "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      oStore.put(orderRecord);

      await new Promise((res, rej) => {
        transaction.oncomplete = res;
        transaction.onerror = rej;
      });

      // Cache tracking token in browser session for seamless tracking
      try {
        sessionStorage.setItem(`ff_tracking_${orderNumber}`, trackingToken);
      } catch (e) {}

      emit("ORDER_PLACED", { orderId, orderNumber, order: orderRecord });
      emit("STOCK_CHANGED", {});

      return {
        success: true,
        order_number: orderNumber,
        order_id: orderId,
        tracking_token: trackingToken,
        order: orderRecord
      };
    },

    // --- ORDERS MANAGEMENT ---
    getOrders: async function () {
      const orders = await getAll("orders");
      return orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },

    getOrder: async function (orderIdOrNumber) {
      const orders = await this.getOrders();
      return orders.find(o => o.id === orderIdOrNumber || o.order_number === orderIdOrNumber) || null;
    },

    updateOrderStatus: async function (orderNumberOrId, newStatus, newPaymentStatus) {
      const { db, transaction } = await tx(["orders", "variants", "stock_history"], "readwrite");
      const oStore = transaction.objectStore("orders");
      const vStore = transaction.objectStore("variants");
      const hStore = transaction.objectStore("stock_history");

      const allOrders = await new Promise(res => {
        const req = oStore.getAll();
        req.onsuccess = () => res(req.result || []);
      });

      const order = allOrders.find(o => o.order_number === orderNumberOrId || o.id === orderNumberOrId);
      if (!order) throw new Error("Order not found");

      const oldStatus = order.status;
      order.status = newStatus || order.status;
      if (newPaymentStatus) order.payment_status = newPaymentStatus;
      order.updated_at = new Date().toISOString();

      // If status changed to CANCELLED, automatically restore inventory!
      if (newStatus === "cancelled" && oldStatus !== "cancelled") {
        for (const item of (order.items || [])) {
          if (item.variant_id) {
            const v = await new Promise(res => {
              const req = vStore.get(item.variant_id);
              req.onsuccess = () => res(req.result);
            });
            if (v) {
              const prev = v.stock_quantity;
              v.stock_quantity = prev + (Number(item.qty) || 1);
              v.updated_at = new Date().toISOString();
              vStore.put(v);

              hStore.put({
                id: `sh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                product_id: item.product_id,
                variant_id: v.id,
                variant_label: `${item.size || ""} ${item.color || ""}`.trim() || "Default",
                previous_quantity: prev,
                new_quantity: v.stock_quantity,
                quantity_change: Number(item.qty) || 1,
                action: "Released",
                reason: `Order #${order.order_number} was cancelled`,
                order_id: order.id,
                created_at: new Date().toISOString()
              });
            }
          }
        }
      }

      oStore.put(order);

      await new Promise((res, rej) => {
        transaction.oncomplete = res;
        transaction.onerror = rej;
      });

      emit("ORDERS_CHANGED", { orderNumber: order.order_number, newStatus });
      if (newStatus === "cancelled") emit("STOCK_CHANGED", {});
      return order;
    },

    trackOrder: async function (orderNumber, tokenOrPhone) {
      const cleanNum = (orderNumber || "").trim().toUpperCase().replace(/^#/, "");
      const order = await this.getOrder(cleanNum);
      if (!order) return null;

      // Allow tracking if matched with tracking token or customer phone
      if (tokenOrPhone) {
        const queryClean = tokenOrPhone.trim().toLowerCase();
        const storedToken = (order.tracking_token || "").toLowerCase();
        const storedPhone = (order.customer?.phone || "").replace(/\D/g, "");
        const queryPhone = tokenOrPhone.replace(/\D/g, "");

        const tokenMatch = storedToken && storedToken === queryClean;
        const phoneMatch = queryPhone.length >= 6 && storedPhone.includes(queryPhone);

        if (!tokenMatch && !phoneMatch) {
          // If neither token nor phone match, return limited public info
          return {
            id: order.order_number,
            status: order.status,
            paymentStatus: order.payment_status,
            date: order.created_at,
            items: order.items || [],
            total: order.total,
            masked: true
          };
        }
      }

      return {
        id: order.order_number,
        status: order.status,
        paymentStatus: order.payment_status,
        date: order.created_at,
        total: order.total,
        customer: order.customer,
        items: order.items || [],
        notes: order.notes,
        masked: false
      };
    },

    // --- SETTINGS, HERO, CATEGORIES & DEPARTMENTS ---
    getSettings: async function () {
      const record = await getByKey("settings", "storefront");
      return record ? record.value : {
        shopName: "Ferry & Fable",
        whatsapp: "+880 1700000000",
        currency: "৳",
        deliveryNote: "Delivery fee is confirmed at checkout based on your address.",
        lowStockThreshold: 5,
        stockSystemEnabled: true,
        logoUrl: ""
      };
    },

    saveSettings: async function (settingsObj) {
      await putItem("settings", { key: "storefront", value: settingsObj, updated_at: new Date().toISOString() });
      emit("SETTINGS_CHANGED", settingsObj);
      return settingsObj;
    },

    getHero: async function () {
      const record = await getByKey("settings", "hero");
      return record ? record.value : null;
    },

    saveHero: async function (heroObj) {
      await putItem("settings", { key: "hero", value: heroObj, updated_at: new Date().toISOString() });
      emit("HERO_CHANGED", heroObj);
      return heroObj;
    },

    getCategories: async function () {
      const record = await getByKey("settings", "categories");
      return record ? record.value : (typeof DEFAULT_CATEGORIES !== "undefined" ? DEFAULT_CATEGORIES : []);
    },

    saveCategories: async function (categoriesArr) {
      await putItem("settings", { key: "categories", value: categoriesArr, updated_at: new Date().toISOString() });
      emit("CATEGORIES_CHANGED", categoriesArr);
      return categoriesArr;
    },

    getDepartments: async function () {
      const record = await getByKey("settings", "departments");
      return record ? record.value : (typeof DEFAULT_DEPARTMENTS !== "undefined" ? DEFAULT_DEPARTMENTS : []);
    },

    saveDepartments: async function (departmentsArr) {
      await putItem("settings", { key: "departments", value: departmentsArr, updated_at: new Date().toISOString() });
      emit("DEPARTMENTS_CHANGED", departmentsArr);
      return departmentsArr;
    },

    // --- BACKUP & RESET TOOLS ---
    exportBackup: async function () {
      const [products, variants, orders, items, history, settings] = await Promise.all([
        getAll("products"),
        getAll("variants"),
        getAll("orders"),
        getAll("order_items"),
        getAll("stock_history"),
        getAll("settings")
      ]);

      return {
        app: "Ferry & Fable E-Commerce",
        version: "3.2",
        exportedAt: new Date().toISOString(),
        data: {
          products,
          variants,
          orders,
          order_items: items,
          stock_history: history,
          settings
        }
      };
    },

    importBackup: async function (backupObj) {
      if (!backupObj || !backupObj.data) throw new Error("Invalid backup JSON format");
      const { products, variants, orders, order_items: items, stock_history: history, settings } = backupObj.data;

      const { db, transaction } = await tx(["products", "variants", "orders", "order_items", "stock_history", "settings"], "readwrite");

      // Clear existing
      transaction.objectStore("products").clear();
      transaction.objectStore("variants").clear();
      transaction.objectStore("orders").clear();
      transaction.objectStore("order_items").clear();
      transaction.objectStore("stock_history").clear();
      transaction.objectStore("settings").clear();

      // Repopulate
      (products || []).forEach(p => transaction.objectStore("products").put(p));
      (variants || []).forEach(v => transaction.objectStore("variants").put(v));
      (orders || []).forEach(o => transaction.objectStore("orders").put(o));
      (items || []).forEach(i => transaction.objectStore("order_items").put(i));
      (history || []).forEach(h => transaction.objectStore("stock_history").put(h));
      (settings || []).forEach(s => transaction.objectStore("settings").put(s));

      await new Promise((res, rej) => {
        transaction.oncomplete = res;
        transaction.onerror = rej;
      });

      emit("PRODUCTS_CHANGED", {});
      emit("ORDERS_CHANGED", {});
      emit("STOCK_CHANGED", {});
      emit("SETTINGS_CHANGED", {});
      return true;
    },

    clearCatalog: async function () {
      const { db, transaction } = await tx(["products", "variants", "settings"], "readwrite");
      transaction.objectStore("products").clear();
      transaction.objectStore("variants").clear();
      transaction.objectStore("settings").put({ key: "db_initialized", value: true, updated_at: new Date().toISOString() });
      await new Promise((res, rej) => {
        transaction.oncomplete = res;
        transaction.onerror = rej;
      });
      emit("PRODUCTS_CHANGED", {});
      emit("STOCK_CHANGED", {});
      return true;
    },

    resetToDemoData: async function () {
      const { db, transaction } = await tx(["products", "variants", "orders", "order_items", "stock_history", "settings"], "readwrite");
      transaction.objectStore("products").clear();
      transaction.objectStore("variants").clear();
      transaction.objectStore("orders").clear();
      transaction.objectStore("order_items").clear();
      transaction.objectStore("stock_history").clear();
      transaction.objectStore("settings").clear();

      await new Promise((res, rej) => {
        transaction.oncomplete = res;
        transaction.onerror = rej;
      });

      await seedDatabaseIfEmpty();
      emit("PRODUCTS_CHANGED", {});
      emit("ORDERS_CHANGED", {});
      emit("STOCK_CHANGED", {});
      emit("SETTINGS_CHANGED", {});
      return true;
    },

    // --- EVENT SUBSCRIPTIONS ---
    on: function (eventType, callback) {
      if (!listeners.has(eventType)) listeners.set(eventType, []);
      listeners.get(eventType).push(callback);
    },

    off: function (eventType, callback) {
      if (!listeners.has(eventType)) return;
      const filtered = listeners.get(eventType).filter(cb => cb !== callback);
      listeners.set(eventType, filtered);
    }
  };

  window.FF_DB = Database;

})(window);
