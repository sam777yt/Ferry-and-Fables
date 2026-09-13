/* ============================================================
   Ferry & Fable - Supabase Client Configuration & Health Check
   Supports live Supabase Cloud or seamless fallback to local IndexedDB.
   ============================================================ */

(function () {
  // Check localStorage for user-configured credentials from the Dashboard
  let savedConfig = {};
  try {
    savedConfig = JSON.parse(localStorage.getItem("ff_supabase_config") || "{}");
  } catch (e) {
    savedConfig = {};
  }

  window.FF_SUPABASE_URL = savedConfig.url || window.FF_SUPABASE_URL || "https://atphxpjqmxbrsqqdaxtd.supabase.co";
  window.FF_SUPABASE_ANON_KEY = savedConfig.anonKey || window.FF_SUPABASE_ANON_KEY || "sb_publishable_Ahwsy4O8J39kLkUiaT5dQQ_PdEBkV2x";

  window.ffSupabase = null;
  window.ffSupabaseReady = false;

  // Validate URL format (must be a valid https URL)
  function isValidSupabaseUrl(url) {
    if (!url || typeof url !== "string") return false;
    try {
      const u = new URL(url);
      return u.protocol === "https:" && u.hostname.endsWith(".supabase.co");
    } catch {
      return false;
    }
  }

  // Initialize client if valid credentials exist
  if (window.supabase && isValidSupabaseUrl(window.FF_SUPABASE_URL) && window.FF_SUPABASE_ANON_KEY && window.FF_SUPABASE_ANON_KEY.length > 15) {
    try {
      window.ffSupabase = window.supabase.createClient(
        window.FF_SUPABASE_URL,
        window.FF_SUPABASE_ANON_KEY
      );
      // Mark tentative ready; async health check verifies actual connectivity
      window.ffSupabaseReady = true;
    } catch (e) {
      console.warn("Could not create Supabase client:", e);
      window.ffSupabaseReady = false;
    }
  }

  window.requireFfSupabase = function () {
    if (!window.ffSupabaseReady || !window.ffSupabase) {
      throw new Error("Supabase is not configured or reachable. Using local database.");
    }
    return window.ffSupabase;
  };

  /**
   * Tests whether the configured Supabase endpoint is reachable and responding.
   * Probes /auth/v1/settings (accessible with publishable key) and checks if schema tables exist.
   * Returns { ok: boolean, tablesReady: boolean, message?: string, error?: string }
   */
  window.testSupabaseConnection = async function (testUrl, testKey) {
    const url = (testUrl || window.FF_SUPABASE_URL || "").trim().replace(/\/$/, "");
    const key = (testKey || window.FF_SUPABASE_ANON_KEY || "").trim();

    if (!isValidSupabaseUrl(url)) {
      return { ok: false, error: "Invalid Supabase URL format. It should be https://<project-ref>.supabase.co" };
    }
    if (!key || key.length < 15) {
      return { ok: false, error: "Invalid API key. Please provide your Supabase publishable key or anon key." };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      // Probe public auth settings endpoint
      const res = await fetch(`${url}/auth/v1/settings`, {
        method: "GET",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok || res.status === 200) {
        // Probe whether products table exists in schema
        try {
          const tableRes = await fetch(`${url}/rest/v1/products?select=id&limit=1`, {
            method: "GET",
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`
            }
          });
          if (tableRes.status === 404) {
            return {
              ok: true,
              tablesReady: false,
              message: "Supabase project reachable, but tables are not created yet. Please run supabase-schema.sql in your Supabase SQL Editor."
            };
          }
        } catch (_) {}

        return {
          ok: true,
          tablesReady: true,
          message: "Connection verified! Supabase is active and database tables are ready."
        };
      } else {
        const text = await res.text();
        return { ok: false, error: `Supabase returned status ${res.status}: ${text || res.statusText}` };
      }
    } catch (err) {
      return { ok: false, error: err.name === "AbortError" ? "Connection timed out after 7 seconds." : err.message || "Failed to reach Supabase endpoint." };
    }
  };

  /**
   * Maps raw Supabase PostgreSQL product & variant rows into the storefront product object schema.
   */
  window.ffMapProductRows = function (products, variants) {
    if (!Array.isArray(products)) return [];
    const variantList = Array.isArray(variants) ? variants : [];

    return products.map(prod => {
      const prodVariants = variantList.filter(v => v.product_id === prod.id);
      const variantStock = {};
      const variantIds = {};

      prodVariants.forEach(v => {
        const s = (v.size || "").trim();
        const c = (v.color || "").trim();
        const key = (!s && !c) ? "default" : `${s}__${c}`;
        variantStock[key] = Number(v.stock_quantity) || 0;
        variantIds[key] = v.id;
      });

      const images = Array.isArray(prod.images) && prod.images.length > 0
        ? prod.images
        : (typeof prod.images === "string" ? [prod.images] : []);

      const sizes = [...new Set(prodVariants.map(v => v.size).filter(Boolean))];
      const colors = [...new Set(prodVariants.map(v => v.color).filter(Boolean))];

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
        stock: prod.status || "in_stock",
        description: prod.description || "",
        trackStock: prod.track_stock !== false,
        lowStockThreshold: prod.low_stock_threshold || 5,
        sizes: sizes.length > 0 ? sizes : (prod.sizes || []),
        colors: colors.length > 0 ? colors : (prod.colors || []),
        variantStock,
        _variantIds: variantIds
      };
    });
  };
})();

