/* ============================================================
   Ferry & Fable — Data Adapter & Bridge
   Connects UI to window.FF_DB (IndexedDB) and optionally Supabase Cloud.
   Supabase is the authoritative database when configured; IndexedDB
   is the automatic offline fallback only.
   ============================================================ */

(function () {
  "use strict";

  const fallbackSettings = {
    shopName: "Ferry & Fable",
    whatsapp: "+880 1700000000",
    currency: "৳",
    deliveryNote: "Delivery fee is confirmed at checkout based on your address.",
    lowStockThreshold: 5,
    stockSystemEnabled: true,
    logoUrl: ""
  };

  function hasSupabase() {
    return Boolean(window.ffSupabaseReady && window.ffSupabase);
  }

  /* ── LOAD CATALOG ───────────────────────────────────────── */
  window.ffLoadCatalog = async function () {
    if (hasSupabase()) {
      try {
        const client = window.requireFfSupabase();
        const [{ data: products, error: productError }, { data: variants, error: variantError }] = await Promise.all([
          client.from("products").select("*").order("created_at", { ascending: true }),
          client.from("product_variants").select("*")
        ]);
        if (!productError && !variantError && Array.isArray(products)) {
          const mapped = typeof window.ffMapProductRows === "function"
            ? window.ffMapProductRows(products, variants || [])
            : products;
          window.ffProductCache = mapped;
          return mapped;
        }
      } catch (e) {
        console.warn("[FF] Supabase load catalog error, falling back to local memory:", e);
      }
    }

    if (window.FF_DB) {
      const prods = await window.FF_DB.getProducts();
      window.ffProductCache = prods;
      return prods;
    }

    return typeof PRODUCTS !== "undefined" ? PRODUCTS : [];
  };

  /* ── LOAD SETTINGS ──────────────────────────────────────── */
  window.ffLoadSettings = async function () {
    if (hasSupabase()) {
      try {
        const client = window.requireFfSupabase();
        const { data, error } = await client.from("settings").select("*").limit(1).maybeSingle();
        if (!error && data) {
          window.ffSettingsCache = data;
          return data;
        }
      } catch (e) {
        console.warn("[FF] Supabase load settings error, falling back to local database:", e);
      }
    }

    if (window.FF_DB) {
      const s = await window.FF_DB.getSettings();
      window.ffSettingsCache = s;
      return s;
    }
    return fallbackSettings;
  };

  /* ── PLACE ORDER ────────────────────────────────────────── */
  // When Supabase is ready, calls the place_order RPC which atomically validates
  // stock, creates the order, inserts line items, and deducts stock in one transaction.
  // Falls back to FF_DB (IndexedDB) only when Supabase is unavailable.
  window.ffPlaceOrder = async function (customer, items, paymentMethod, notes) {
    paymentMethod = paymentMethod || "cod";
    notes = notes || "";

    if (hasSupabase()) {
      try {
        const client = window.requireFfSupabase();

        // Ensure catalog is loaded in memory for accurate variant ID resolution
        if (!window.ffProductCache || !window.ffProductCache.length) {
          if (typeof window.ffLoadCatalog === "function") {
            window.ffProductCache = await window.ffLoadCatalog();
          }
        }

        // Map storefront cart items → RPC format using the cached catalog's variant IDs
        const rpcItems = items.map(function (it) {
          const prod = (window.ffProductCache || []).find(function (p) { return p.id === it.id; });
          const s = (it.size || "").trim();
          const c = (it.color || "").trim();
          const vKey = (!s && !c) ? "default" : (s + "__" + c);
          
          let variantId = prod && prod._variantIds && (
            prod._variantIds[vKey] ||
            prod._variantIds["default"] ||
            (Object.values(prod._variantIds).length === 1 ? Object.values(prod._variantIds)[0] : null)
          );

          if (!variantId) {
            throw new Error(
              "Cannot place order: variant not found for \"" + (it.name || it.id) + "\" (" + (vKey === "default" ? "Standard" : vKey) + "). " +
              "Please refresh the page and try again."
            );
          }
          return { variant_id: variantId, quantity: Number(it.qty) || 1 };
        });

        const { data, error } = await client.rpc("place_order", {
          p_customer_name:    customer.name,
          p_customer_phone:   customer.phone,
          p_customer_address: customer.address,
          p_tracking_token:   customer.phone,  // phone number used as the tracking token
          p_items:            rpcItems,
          p_payment_method:   paymentMethod,
          p_notes:            notes
        });

        if (error) throw error;

        // data = { order_id, order_number, total }
        return {
          order_number: data.order_number,
          total:        data.total,
          order:        { created_at: new Date().toISOString() }
        };
      } catch (e) {
        console.error("[FF] Supabase place_order failed — falling back to local DB:", e);
        if (window.FF_DB) {
          return await window.FF_DB.placeOrder(customer, items, paymentMethod, notes);
        }
        throw e;
      }
    }

    if (window.FF_DB) {
      return await window.FF_DB.placeOrder(customer, items, paymentMethod, notes);
    }

    throw new Error("Database engine not available");
  };

  /* ── TRACK ORDER ────────────────────────────────────────── */
  // When Supabase is ready, calls the track_order RPC which requires the tracking
  // token (phone number) to verify the customer before returning order details.
  // Returns { masked: true } when no phone is provided — the UI should prompt for it.
  // Returns null when the order doesn't exist or the phone doesn't match.
  window.ffTrackOrder = async function (orderNumber, tokenOrPhone) {
    if (hasSupabase()) {
      if (!tokenOrPhone) {
        // No phone provided — signal the UI to show the phone entry prompt
        return { masked: true };
      }
      try {
        const client = window.requireFfSupabase();
        const { data, error } = await client.rpc("track_order", {
          p_order_number:   orderNumber,
          p_tracking_token: tokenOrPhone
        });

        if (error) throw error;
        // data is null when order doesn't exist or phone hash doesn't match
        if (data) {
          data.masked = false;
          return data;
        }
        return null;
      } catch (e) {
        console.warn("[FF] Supabase track_order error:", e);
        // On network failure, fall back to local DB so the customer isn't left stranded
        if (window.FF_DB) {
          return await window.FF_DB.trackOrder(orderNumber, tokenOrPhone);
        }
        return null;
      }
    }

    if (window.FF_DB) {
      return await window.FF_DB.trackOrder(orderNumber, tokenOrPhone);
    }
    return null;
  };

  /* ── ADJUST STOCK ───────────────────────────────────────── */
  // When Supabase is ready, calls the adjust_stock RPC which requires the caller
  // to have an admin JWT (is_admin() check). Falls back to FF_DB on error.
  window.ffAdjustStock = async function (variantId, delta, reason, action) {
    if (hasSupabase()) {
      try {
        const client = window.requireFfSupabase();
        const { data, error } = await client.rpc("adjust_stock", {
          p_variant_id: variantId,
          p_delta:      Number(delta),
          p_reason:     reason || "Manual adjustment",
          p_action:     action || "manual_adjustment"
        });
        if (error) throw error;
        return data;
      } catch (e) {
        console.error("[FF] Supabase adjust_stock failed — falling back to local DB:", e);
        if (window.FF_DB) {
          return await window.FF_DB.adjustStock(variantId, delta, reason, action);
        }
        throw e;
      }
    }

    if (window.FF_DB) {
      return await window.FF_DB.adjustStock(variantId, delta, reason, action);
    }
    throw new Error("Database engine not available");
  };

  /* ── REALTIME SUBSCRIBE ─────────────────────────────────── */
  // Singleton channel reference — prevents duplicate subscriptions when
  // ffSubscribe() is called multiple times (e.g. after each data refresh cycle).
  let _ffChannel      = null;
  let _ffChannelState = null;

  window.ffSubscribe = function (onChange, onOrder) {
    // 1. Local IndexedDB cross-tab events (always wire these; they fire in local-only mode)
    if (window.FF_DB) {
      if (onChange) {
        window.FF_DB.on("PRODUCTS_CHANGED",  onChange);
        window.FF_DB.on("STOCK_CHANGED",     onChange);
        window.FF_DB.on("SETTINGS_CHANGED",  onChange);
      }
      if (onOrder) {
        window.FF_DB.on("ORDER_PLACED",   onOrder);
        window.FF_DB.on("ORDERS_CHANGED", onOrder);
      }
    }

    // 2. Supabase Realtime channel (singleton — skip if channel is already live)
    if (hasSupabase()) {
      try {
        const client = window.requireFfSupabase();

        if (_ffChannel && _ffChannelState === "SUBSCRIBED") {
          return _ffChannel; // Already live — nothing to do
        }

        // Clean up a stale or errored channel before re-subscribing
        if (_ffChannel) {
          try { client.removeChannel(_ffChannel); } catch (_) {}
          _ffChannel      = null;
          _ffChannelState = null;
        }

        _ffChannel = client
          .channel("ferry-fable-live")
          .on("postgres_changes", { event: "*",      schema: "public", table: "products"         }, onChange)
          .on("postgres_changes", { event: "*",      schema: "public", table: "product_variants" }, onChange)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders"           }, onOrder || onChange)
          .subscribe(function (status, err) {
            _ffChannelState = status;
            if (status === "SUBSCRIBED") {
              console.log("[FF] Realtime channel connected — live updates are active.");
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              console.warn("[FF] Realtime channel error:", status, err);
              _ffChannelState = null; // Allow re-subscription attempt next time
            }
          });

        return _ffChannel;
      } catch (e) {
        console.warn("[FF] Supabase realtime subscription skipped:", e);
      }
    }

    return { unsubscribe: function () {} };
  };
})();
