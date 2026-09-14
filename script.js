/* ============================================================
   FERRY & FABLE — STOREFRONT SCRIPT
   Full dynamic sync with Owner Dashboard via localStorage
   ============================================================ */

/* ============================================================
   CONFIG & INITIAL SEEDING
   ============================================================ */
function getCleanWhatsAppNumber(raw) {
  let num = (raw || "").replace(/\D/g, "");
  if (num.startsWith("0")) num = "88" + num;
  return num || "8801700000000";
}

function getSettings() {
  if (window.ffSettingsCache) return window.ffSettingsCache;
  try {
    const saved = localStorage.getItem("ff_settings");
    if (saved) {
      const parsed = JSON.parse(saved);
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
    }
  } catch (e) {}
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

let _settings = getSettings();
let SHOP_NAME = _settings.shopName || "Ferry & Fable";
let WHATSAPP_NUMBER = getCleanWhatsAppNumber(_settings.whatsapp || "8801700000000");
let CURRENCY = _settings.currency || "৳";



/* Seed localStorage on first visit or version upgrade */
(function seedData() {
  const version = localStorage.getItem("ff_catalog_version");
  if (!version || (version !== "3.1" && version !== "3.2")) {
    if (typeof PRODUCTS !== "undefined") {
      localStorage.setItem("ff_products", JSON.stringify(PRODUCTS));
    }
    if (typeof DEFAULT_CATEGORIES !== "undefined") {
      localStorage.setItem("ff_categories", JSON.stringify(DEFAULT_CATEGORIES));
    }
    if (typeof DEFAULT_DEPARTMENTS !== "undefined") {
      localStorage.setItem("ff_departments", JSON.stringify(DEFAULT_DEPARTMENTS));
    }
    localStorage.setItem("ff_catalog_version", "3.2");
  }

  if (!localStorage.getItem("ff_hero")) {
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
    localStorage.setItem("ff_hero", JSON.stringify(defaultHero));
  }
})();

function loadDepartments() {
  if (window.ffSettingsCache?.departments) return window.ffSettingsCache.departments;
  try {
    const raw = localStorage.getItem("ff_departments");
    let depts = raw ? JSON.parse(raw) : (typeof DEFAULT_DEPARTMENTS !== "undefined" ? [...DEFAULT_DEPARTMENTS] : [
      { id: "dept_all", name: "All items", slug: "all" },
      { id: "dept_men", name: "Men", slug: "Men" },
      { id: "dept_women", name: "Women", slug: "Women" },
      { id: "dept_home", name: "Home & Living", slug: "Home & Living" }
    ]);
    return depts.map(d => {
      if (d.name === "Home" || d.slug === "Home") {
        return { ...d, name: "Home & Living", slug: "Home & Living" };
      }
      return d;
    });
  } catch { return []; }
}

function getLiveProducts() {
  if (Array.isArray(window.ffProductCache)) return window.ffProductCache;
  try {
    const raw = localStorage.getItem("ff_products");
    if (raw && raw.includes('"id":"p1"') && typeof PRODUCTS !== "undefined" && PRODUCTS.length === 0) {
      localStorage.removeItem("ff_products");
      return [];
    }
    const prods = raw ? JSON.parse(raw) : (typeof PRODUCTS !== "undefined" ? PRODUCTS : []);
    return prods.map(p => {
      let dept = p.department || "All";
      if (dept === "Home") dept = "Home & Living";
      if (typeof ensureProductStock === "function") ensureProductStock(p);
      let liveStock = p.stock || "in_stock";
      if (liveStock !== "hidden" && typeof getProductStockSummary === "function") {
        const sum = getProductStockSummary(p);
        liveStock = sum.available <= 0 ? "out_of_stock" : "in_stock";
      }
      return {
        ...p,
        stock: liveStock,
        department: dept
      };
    });
  } catch (e) {
    return typeof PRODUCTS !== "undefined" ? PRODUCTS : [];
  }
}



function getLiveHero() {
  if (window.ffSettingsCache?.hero) return window.ffSettingsCache.hero;
  try {
    const raw = localStorage.getItem("ff_hero");
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

/* ============================================================
   STATE
   ============================================================ */
// Cart format: { [cartKey]: { id, qty, size, color } }
let cart = JSON.parse(localStorage.getItem("ff_cart_v2") || "{}");
let activeDepartment = "all"; // "all" | "Men" | "Women" | "Home"
let activeCategory = "all";
let searchTerm = "";

// Modal State
let currentModalProduct = null;
let currentModalImage = "";
let currentModalSize = "";
let currentModalColor = "";
let currentModalQty = 1;

/* ============================================================
   HELPERS
   ============================================================ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const money = (n) => CURRENCY + Number(n || 0).toLocaleString("en-US");

function saveCart() {
  localStorage.setItem("ff_cart_v2", JSON.stringify(cart));
}

function getProduct(id) {
  return getLiveProducts().find((p) => p.id === id);
}

function makeCartKey(id, size, color) {
  return `${id}__${size || ""}__${color || ""}`;
}

function cartTotalQty() {
  return Object.values(cart).reduce((sum, item) => sum + (item.qty || 0), 0);
}

function cartSubtotal() {
  return Object.values(cart).reduce((sum, item) => {
    const p = getProduct(item.id);
    return p ? sum + p.price * item.qty : sum;
  }, 0);
}

function showToast(msg) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 2400);
}

function escHtml(str) {
  return str == null ? "" : String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/* ============================================================
   RENDER: HERO & DEPARTMENT SHOWCASE
   ============================================================ */
function applyHeroAndShowcase() {
  const h = getLiveHero();
  if (!h) return;

  // Hero section text
  if (h.eyebrow && $("#heroEyebrow")) $("#heroEyebrow").textContent = h.eyebrow;
  if (h.title && $("#heroTitle")) $("#heroTitle").innerHTML = escHtml(h.title).replace(/\n/g, "<br>");
  if (h.subtitle && $("#heroSub")) $("#heroSub").textContent = h.subtitle;
  if (h.btn1 && $("#heroBtn1")) $("#heroBtn1").textContent = h.btn1;
  if (h.btn2 && $("#heroBtn2")) $("#heroBtn2").textContent = h.btn2;

  // Stats
  if (h.stat1Val && $("#heroStat1Val")) $("#heroStat1Val").textContent = h.stat1Val;
  if (h.stat1Label && $("#heroStat1Label")) $("#heroStat1Label").textContent = h.stat1Label;
  if (h.stat2Val && $("#heroStat2Val")) $("#heroStat2Val").textContent = h.stat2Val;
  if (h.stat2Label && $("#heroStat2Label")) $("#heroStat2Label").textContent = h.stat2Label;
  if (h.stat3Val && $("#heroStat3Val")) $("#heroStat3Val").textContent = h.stat3Val;
  if (h.stat3Label && $("#heroStat3Label")) $("#heroStat3Label").textContent = h.stat3Label;

  // Custom Website Hero Images
  if (h.heroImage1 && $("#heroCard1")) {
    $("#heroCard1").style.backgroundImage = `url('${h.heroImage1}')`;
  }
  if (h.heroImage2 && $("#heroCard2")) {
    $("#heroCard2").style.backgroundImage = `url('${h.heroImage2}')`;
  }

  // Department Showcase Section
  const showcaseEl = $("#departmentShowcase");
  if (showcaseEl && h.sectionsEnabled === false) {
    showcaseEl.style.display = "none";
    return;
  }
  if (showcaseEl) showcaseEl.style.display = "block";

  // Men section
  if (h.menSection) {
    if ($("#menShowcaseTitle")) $("#menShowcaseTitle").textContent = h.menSection.title || "Men's Collection";
    if ($("#menShowcaseSub")) $("#menShowcaseSub").textContent = h.menSection.subtitle || "Shirts, chinos & essentials";
    if ($("#menShowcaseBtn")) $("#menShowcaseBtn").textContent = h.menSection.btnText || "Explore Men →";
    if (h.menSection.image && $("#menShowcaseBg")) {
      $("#menShowcaseBg").style.backgroundImage = `url('${h.menSection.image}')`;
    }
    if (h.menSection.categories && $("#menShowcaseSubcats")) {
      $("#menShowcaseSubcats").innerHTML = h.menSection.categories
        .map(cat => `<button type="button" class="showcase-subcat-chip" data-dept="Men" data-cat="${escHtml(cat)}">${escHtml(cat)}</button>`)
        .join("");
    }
  }

  // Women section
  if (h.womenSection) {
    if ($("#womenShowcaseTitle")) $("#womenShowcaseTitle").textContent = h.womenSection.title || "Women's Collection";
    if ($("#womenShowcaseSub")) $("#womenShowcaseSub").textContent = h.womenSection.subtitle || "Linen dresses & tops";
    if ($("#womenShowcaseBtn")) $("#womenShowcaseBtn").textContent = h.womenSection.btnText || "Explore Women →";
    if (h.womenSection.image && $("#womenShowcaseBg")) {
      $("#womenShowcaseBg").style.backgroundImage = `url('${h.womenSection.image}')`;
    }
    if (h.womenSection.categories && $("#womenShowcaseSubcats")) {
      $("#womenShowcaseSubcats").innerHTML = h.womenSection.categories
        .map(cat => `<button type="button" class="showcase-subcat-chip" data-dept="Women" data-cat="${escHtml(cat)}">${escHtml(cat)}</button>`)
        .join("");
    }
  }

  // Wire clickable showcase subcategory tags
  $$(".showcase-subcat-chip").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      activeDepartment = btn.dataset.dept;
      activeCategory = btn.dataset.cat;
      renderDepartmentTabs();
      renderCategories();
      renderProducts();
      const shopEl = document.querySelector("#shop");
      if (shopEl) shopEl.scrollIntoView({ behavior: "smooth" });
    };
  });

  // Shop delivery note in cart
  if (_settings.deliveryNote && $("#cartDeliveryNote")) {
    $("#cartDeliveryNote").textContent = _settings.deliveryNote;
  }
}

/* ============================================================
   RENDER: DEPARTMENTS & CATEGORIES
   ============================================================ */
function renderDepartmentTabs() {
  const container = $("#deptTabs");
  if (!container) return;
  const depts = loadDepartments();

  container.innerHTML = depts.map(d => {
    const slug = d.slug || d.name;
    const isAct = (slug.toLowerCase() === activeDepartment.toLowerCase()) || (slug === "all" && activeDepartment === "all");
    return `<button class="dept-tab ${isAct ? "active" : ""}" data-department="${escHtml(slug)}">${escHtml(d.name)}</button>`;
  }).join("");

  container.querySelectorAll(".dept-tab").forEach(tab => {
    tab.onclick = () => {
      activeDepartment = tab.dataset.department;
      activeCategory = "all";
      renderDepartmentTabs();
      renderCategories();
      renderProducts();
    };
  });
}


function renderCategories() {
  const products = getLiveProducts().filter(p => p.stock !== "hidden");
  let relevantProducts = products;

  // STRICT FILTER: Do not mix Men, Women, or other departments
  if (activeDepartment !== "all") {
    const target = activeDepartment.toLowerCase();
    relevantProducts = products.filter(p => {
      const dept = (p.department || "").toLowerCase();
      return dept === target;
    });
  }

  // Build department's own unique tags/categories
  const categorySet = new Set();

  const h = getLiveHero();
  if (activeDepartment === "Men" && h && h.menSection && Array.isArray(h.menSection.categories)) {
    h.menSection.categories.forEach(c => categorySet.add(c));
  } else if (activeDepartment === "Women" && h && h.womenSection && Array.isArray(h.womenSection.categories)) {
    h.womenSection.categories.forEach(c => categorySet.add(c));
  }

  relevantProducts.forEach(p => {
    if (p.subcategory) categorySet.add(p.subcategory);
    else if (p.category) categorySet.add(p.category);
  });

  const categories = ["all", ...Array.from(categorySet)];
  const strip = $("#catStrip");
  if (!strip) return;

  strip.innerHTML = categories
    .map(
      (cat) => `
      <button class="cat-chip ${cat.toLowerCase() === activeCategory.toLowerCase() ? "active" : ""}" data-category="${escHtml(cat)}">
        ${cat === "all" ? (activeDepartment === "all" ? "All items" : `All ${activeDepartment}`) : escHtml(cat)}
      </button>`
    )
    .join("");

  strip.querySelectorAll(".cat-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.category;
      renderCategories();
      renderProducts();
    });
  });
}

/* ============================================================
   RENDER: PRODUCT GRID
   ============================================================ */
function renderProducts() {
  const grid = $("#productGrid");
  const empty = $("#emptyState");
  if (!grid) return;

  let all = getLiveProducts();

  // 1. Exclude hidden products
  let list = all.filter((p) => p.stock !== "hidden");

  // 2. Strict Filter by department (Men, Women, Home, etc.) — DO NOT MIX
  if (activeDepartment !== "all") {
    const targetDept = activeDepartment.toLowerCase();
    list = list.filter((p) => {
      const pDept = (p.department || "").toLowerCase();
      return pDept === targetDept;
    });
  }

  // 3. Filter by category / subcategory / tag
  if (activeCategory !== "all") {
    const targetCat = activeCategory.toLowerCase();
    list = list.filter((p) => {
      const catMatch = (p.category || "").toLowerCase() === targetCat;
      const subMatch = (p.subcategory || "").toLowerCase() === targetCat;
      const tagMatch = (p.tag || "").toLowerCase() === targetCat;
      const nameMatch = (p.name || "").toLowerCase().includes(targetCat);
      return catMatch || subMatch || tagMatch || nameMatch;
    });
  }

  // 4. Search term
  if (searchTerm) {
    list = list.filter((p) => {
      const nameMatch = (p.name || "").toLowerCase().includes(searchTerm);
      const catMatch = (p.category || "").toLowerCase().includes(searchTerm);
      const subMatch = (p.subcategory || "").toLowerCase().includes(searchTerm);
      const deptMatch = (p.department || "").toLowerCase().includes(searchTerm);
      return nameMatch || catMatch || subMatch || deptMatch;
    });
  }

  // Update Section Title & Result Count
  if ($("#catalogTitle")) {
    if (activeDepartment === "Men") $("#catalogTitle").textContent = "Men's Collection";
    else if (activeDepartment === "Women") $("#catalogTitle").textContent = "Women's Collection";
    else if (activeDepartment.toLowerCase().includes("home")) $("#catalogTitle").textContent = "Home & Living";
    else if (activeDepartment !== "all") $("#catalogTitle").textContent = `${activeDepartment} Collection`;
    else $("#catalogTitle").textContent = "The catalog";
  }


  $("#resultCount").textContent = `${list.length} item${list.length === 1 ? "" : "s"}`;


  if (list.length === 0) {
    grid.innerHTML = "";
    if (empty) {
      empty.hidden = false;
      if (searchTerm) {
        empty.innerHTML = `No products matching "<strong>${escHtml(searchTerm)}</strong>". <button type="button" class="btn btn-ghost" id="emptyClearSearchBtn" style="margin-left:8px;padding:4px 10px;font-size:0.82rem;display:inline-block">Clear search</button>`;
        const clearBtn = document.getElementById("emptyClearSearchBtn");
        if (clearBtn) {
          clearBtn.addEventListener("click", () => {
            searchTerm = "";
            const si = $("#searchInput");
            const msi = $("#mobileSearchInput");
            if (si) si.value = "";
            if (msi) msi.value = "";
            renderProducts();
          });
        }
      } else {
        empty.textContent = "No products match your filter. Try selecting another category.";
      }
    }
    return;
  }
  if (empty) empty.hidden = true;

  grid.innerHTML = list
    .map((p) => {
      const isOutOfStock = p.stock === "out_of_stock";
      const sizeCount = (p.sizes && p.sizes.length) ? p.sizes.length : 0;
      const colorCount = (p.colors && p.colors.length) ? p.colors.length : 0;
      let variantHint = "";
      if (sizeCount > 0 && colorCount > 0) {
        variantHint = `<span class="product-variants-hint">${sizeCount} sizes • ${colorCount} colors</span>`;
      } else if (sizeCount > 0) {
        variantHint = `<span class="product-variants-hint">${sizeCount} sizes</span>`;
      } else if (colorCount > 0) {
        variantHint = `<span class="product-variants-hint">${colorCount} colors</span>`;
      }

      const hasDiscount = p.oldPrice && Number(p.oldPrice) > Number(p.price);
      const discountPct = hasDiscount ? Math.round((1 - Number(p.price) / Number(p.oldPrice)) * 100) : 0;

      return `
      <article class="product-card ${isOutOfStock ? "out-of-stock" : ""}" data-id="${escHtml(p.id)}">
        <div class="product-media">
          ${p.tag ? `<span class="product-tag">${escHtml(p.tag)}</span>` : ""}
          ${hasDiscount ? `<span class="badge-discount">-${discountPct}%</span>` : ""}
          ${isOutOfStock ? `<span class="badge-stock-out">Out of stock</span>` : ""}
          <button type="button" class="card-share-btn" data-id="${escHtml(p.id)}" title="Copy share link for sales" aria-label="Share product">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          </button>
          <img src="${escHtml(p.image)}" alt="${escHtml(p.name)}" loading="lazy">
          <span class="card-quick-view">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Quick View
          </span>
        </div>
        <div class="product-body">
          <span class="product-cat">${escHtml(p.department ? p.department + " • " : "")}${escHtml(p.category)}</span>
          <h3 class="product-name">${escHtml(p.name)}</h3>
          ${variantHint}
          <div class="product-price-row">
            <span class="product-price">${money(p.price)}</span>
            ${p.oldPrice ? `<span class="product-old-price">${money(p.oldPrice)}</span>` : ""}
            ${hasDiscount ? `<span class="product-save-badge">Save ${money(p.oldPrice - p.price)}</span>` : ""}
          </div>
          <button class="add-btn ${isOutOfStock ? "out-of-stock" : ""}" data-id="${escHtml(p.id)}" ${isOutOfStock ? "disabled" : ""}>
            ${isOutOfStock ? "Out of stock" : "Add to bag"}
          </button>
        </div>
      </article>`;
    })
    .join("");

  // Card click -> opens product details modal
  grid.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      // Direct share link from card
      if (e.target.closest(".card-share-btn")) {
        e.stopPropagation();
        const id = e.target.closest(".card-share-btn").dataset.id;
        const p = getProduct(id);
        const base = window.location.href.split("?")[0].split("#")[0];
        const link = `${base}?product=${id}`;
        navigator.clipboard.writeText(link).then(() => {
          showToast(`✓ Copied link for ${p ? p.name : 'product'}!`, "success");
        }).catch(() => {
          const ta = document.createElement("textarea");
          ta.value = link; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.focus(); ta.select();
          document.execCommand("copy"); document.body.removeChild(ta);
          showToast(`✓ Copied link for ${p ? p.name : 'product'}!`, "success");
        });
        return;
      }

      // If directly clicked the add button
      if (e.target.closest(".add-btn")) {
        const btn = e.target.closest(".add-btn");
        const id = btn.dataset.id;
        const p = getProduct(id);
        if (!p || p.stock === "out_of_stock") return;

        // If product has sizes or colors, open modal so user can choose
        if ((p.sizes && p.sizes.length > 0) || (p.colors && p.colors.length > 0)) {
          openProductModal(id);
        } else {
          // No options, add directly
          addToCart(id);
          btn.textContent = "Added ✓";
          btn.classList.add("added");
          setTimeout(() => {
            btn.textContent = "Add to bag";
            btn.classList.remove("added");
          }, 1100);
        }
        return;
      }

      // Otherwise clicking card opens full details modal
      openProductModal(card.dataset.id);
    });
  });
}

/* ============================================================
   PRODUCT DETAIL MODAL LOGIC & AUTO IMAGE SLIDING
   ============================================================ */
function slideModalImage(targetImg) {
  if (!targetImg || targetImg === currentModalImage) return;
  const imgEl = $("#modalMainImage");
  if (!imgEl) return;

  imgEl.classList.remove("slide-in", "slide-out");
  imgEl.classList.add("slide-out");

  setTimeout(() => {
    currentModalImage = targetImg;
    imgEl.src = targetImg;
    imgEl.classList.remove("slide-out");
    imgEl.classList.add("slide-in");

    setTimeout(() => {
      imgEl.classList.remove("slide-in");
    }, 280);
  }, 160);

  // Update thumbnail active indicator
  const thumbsContainer = $("#modalThumbsList");
  if (thumbsContainer) {
    thumbsContainer.querySelectorAll(".gallery-thumb-btn").forEach(b => {
      const isActive = b.dataset.img === targetImg;
      b.classList.toggle("active", isActive);
      if (isActive) {
        b.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    });
  }
}

function openProductModal(id) {

  const p = getProduct(id);
  if (!p) return;

  currentModalProduct = p;
  currentModalQty = 1;
  currentModalSize = (p.sizes && p.sizes.length) ? p.sizes[0] : "";
  currentModalColor = (p.colors && p.colors.length) ? p.colors[0] : "";
  currentModalImage = p.image || "";

  const modal = $("#productDetailModal");
  if (!modal) return;

  // Main Image & Tag
  $("#modalMainImage").src = currentModalImage;
  const tagEl = $("#modalProductTag");
  if (p.tag) {
    tagEl.textContent = p.tag;
    tagEl.style.display = "block";
  } else {
    tagEl.style.display = "none";
  }

  // Stock Badge
  const stockBadge = $("#modalStockBadge");
  const isOutOfStock = p.stock === "out_of_stock";
  if (isOutOfStock) {
    stockBadge.textContent = "Out of stock";
    stockBadge.className = "detail-stock-badge out-of-stock";
  } else {
    stockBadge.textContent = "In stock";
    stockBadge.className = "detail-stock-badge in-stock";
  }

  // Thumbnails Gallery (Main + Extra Images)
  const thumbsContainer = $("#modalThumbsList");
  const allImages = [p.image, ...(p.extraImages || [])].filter(Boolean);
  if (allImages.length > 1) {
    thumbsContainer.style.display = "flex";
    thumbsContainer.innerHTML = allImages.map((imgSrc, idx) => `
      <button type="button" class="gallery-thumb-btn ${imgSrc === currentModalImage ? "active" : ""}" data-img="${escHtml(imgSrc)}" aria-label="${escHtml(p.name)} - image ${idx + 1} of ${allImages.length}">
        <img src="${escHtml(imgSrc)}" alt="${escHtml(p.name)} view ${idx + 1}">
      </button>
    `).join("");

    thumbsContainer.querySelectorAll(".gallery-thumb-btn").forEach(btn => {
      btn.onclick = () => {
        slideModalImage(btn.dataset.img);
      };
    });
  } else {
    thumbsContainer.style.display = "none";
    thumbsContainer.innerHTML = "";
  }

  // Title, Dept, Category, Subcat
  $("#modalProductDept").textContent = p.department || "Everyday";
  $("#modalProductCat").textContent = p.category || "";
  if (p.subcategory) {
    $("#modalProductSubcat").textContent = p.subcategory;
    $("#modalSubcatWrap").style.display = "inline";
  } else {
    $("#modalSubcatWrap").style.display = "none";
  }
  $("#modalProductName").textContent = p.name;

  // Price & Old Price
  $("#modalProductPrice").textContent = money(p.price);
  if (p.oldPrice && p.oldPrice > p.price) {
    $("#modalProductOldPrice").textContent = money(p.oldPrice);
    $("#modalProductOldPrice").style.display = "inline";
    const discount = Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100);
    $("#modalDiscountBadge").textContent = `Save ${discount}%`;
    $("#modalDiscountBadge").style.display = "inline-block";
  } else {
    $("#modalProductOldPrice").style.display = "none";
    $("#modalDiscountBadge").style.display = "none";
  }

  // Color Selector with AUTOMATIC IMAGE SLIDING
  const colorGroup = $("#modalColorGroup");
  const swatches = $("#modalColorSwatches");
  if (p.colors && p.colors.length > 0) {
    colorGroup.style.display = "block";
    $("#selectedColorName").textContent = currentModalColor;
    swatches.innerHTML = p.colors.map(color => `
      <button type="button" class="color-swatch-btn ${color === currentModalColor ? "active" : ""}" data-color="${escHtml(color)}" aria-pressed="${color === currentModalColor ? 'true' : 'false'}" role="radio" aria-label="Color: ${escHtml(color)}">
        <span class="color-swatch-dot" style="background:${getColorHex(color)}"></span>
        <span>${escHtml(color)}</span>
      </button>
    `).join("");

    swatches.querySelectorAll(".color-swatch-btn").forEach((btn, colorIdx) => {
      btn.onclick = () => {
        currentModalColor = btn.dataset.color;
        $("#selectedColorName").textContent = currentModalColor;
        swatches.querySelectorAll(".color-swatch-btn").forEach(b => {
          b.classList.remove("active");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");

        // AUTOMATIC IMAGE SLIDE TO TARGETED COLOR!
        if (allImages.length > 0) {
          const targetImg = allImages[colorIdx % allImages.length];
          slideModalImage(targetImg);
        }
        updateModalStockAlert(p);
      };
    });
  } else {
    colorGroup.style.display = "none";
  }


  // Size Selector
  const sizeGroup = $("#modalSizeGroup");
  const sizesContainer = $("#modalSizeChips");
  if (p.sizes && p.sizes.length > 0) {
    sizeGroup.style.display = "block";
    $("#selectedSizeName").textContent = currentModalSize;
    sizesContainer.innerHTML = p.sizes.map(size => `
      <button type="button" class="size-chip-btn ${size === currentModalSize ? "active" : ""}" data-size="${escHtml(size)}" aria-pressed="${size === currentModalSize ? 'true' : 'false'}" role="radio" aria-label="Size: ${escHtml(size)}">
        ${escHtml(size)}
      </button>
    `).join("");

    sizesContainer.querySelectorAll(".size-chip-btn").forEach(btn => {
      btn.onclick = () => {
        currentModalSize = btn.dataset.size;
        $("#selectedSizeName").textContent = currentModalSize;
        sizesContainer.querySelectorAll(".size-chip-btn").forEach(b => {
          b.classList.remove("active");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        updateModalStockAlert(p);
      };
    });
  } else {
    sizeGroup.style.display = "none";
  }

  // Description
  $("#modalProductDesc").textContent = p.description || "No description provided.";

  // Quantity Reset
  $("#modalQtyVal").textContent = currentModalQty;

  // Add to Bag Button State
  const addBtn = $("#modalAddToCartBtn");
  if (isOutOfStock) {
    addBtn.textContent = "Out of stock";
    addBtn.disabled = true;
  } else {
    addBtn.textContent = "Add to bag";
    addBtn.disabled = false;
  }

  modal.classList.add("open");

  // Focus trap: move focus into modal and cycle within it
  const modalEl = modal.querySelector(".modal-product");
  if (modalEl) {
    const focusableSelectors = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = [...modalEl.querySelectorAll(focusableSelectors)];
    if (focusables.length) {
      // Save the element that triggered modal opening
      modal._opener = document.activeElement;
      setTimeout(() => focusables[0].focus(), 50);
      modal._trapHandler = (e) => {
        if (e.key !== "Tab") return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey) { if (document.activeElement === first) { last.focus(); e.preventDefault(); } }
        else { if (document.activeElement === last) { first.focus(); e.preventDefault(); } }
      };
      modal.addEventListener("keydown", modal._trapHandler);
    }
  }
}

function closeProductModal() {
  const modal = $("#productDetailModal");
  if (!modal) return;
  // Remove focus trap and restore focus to opener
  if (modal._trapHandler) { modal.removeEventListener("keydown", modal._trapHandler); modal._trapHandler = null; }
  if (modal._opener && typeof modal._opener.focus === "function") { modal._opener.focus(); modal._opener = null; }
  modal.classList.remove("open");
}

// Updates #modalStockAlert based on current selected size/color in modal
function updateModalStockAlert(p) {
  const alertEl = $("#modalStockAlert");
  const addBtn = $("#modalAddToCartBtn");
  const incBtn = $("#qtyIncBtn");
  if (!alertEl || !p) return;

  if (typeof getAvailableStock !== "function") {
    alertEl.style.display = "none";
    return;
  }

  // If the stock system is globally disabled or disabled for this product
  if (typeof isStockSystemActive === "function" && !isStockSystemActive(p)) {
    const isOut = p.stock === "out_of_stock";
    if (isOut) {
      alertEl.style.display = "flex";
      alertEl.className = "modal-stock-alert out-of-stock";
      alertEl.innerHTML = `🔴 Out of stock — This item is currently unavailable`;
      if (addBtn) {
        addBtn.disabled = true;
        addBtn.textContent = "Out of stock";
      }
      if (incBtn) incBtn.disabled = true;
      currentModalQty = 0;
      const qtyEl = $("#modalQtyVal");
      if (qtyEl) qtyEl.textContent = "0";
    } else {
      alertEl.style.display = "none";
      if (addBtn) {
        addBtn.disabled = false;
        addBtn.textContent = "Add to bag";
      }
      if (incBtn) incBtn.disabled = false;
      if (currentModalQty <= 0) {
        currentModalQty = 1;
        const qtyEl = $("#modalQtyVal");
        if (qtyEl) qtyEl.textContent = "1";
      }
    }
    return;
  }

  const settings = typeof getSettings === "function" ? getSettings() : {};
  const threshold = parseInt(settings.lowStockThreshold) || 5;
  const avail = getAvailableStock(p.id, currentModalSize, currentModalColor);

  alertEl.style.display = "flex";
  alertEl.className = "modal-stock-alert";

  if (avail <= 0) {
    alertEl.className += " out-of-stock";
    alertEl.innerHTML = `🔴 Out of stock — This variant is unavailable`;
    if (addBtn) { addBtn.disabled = true; addBtn.textContent = "Out of stock"; }
    if (incBtn) incBtn.disabled = true;
    currentModalQty = 0;
    const qtyEl = $("#modalQtyVal");
    if (qtyEl) qtyEl.textContent = "0";
  } else if (avail <= threshold) {
    alertEl.className += " low-stock";
    const label = (currentModalSize || currentModalColor)
      ? [currentModalColor, currentModalSize].filter(Boolean).join(" / ")
      : "This item";
    alertEl.innerHTML = `⚠️ ${escHtml(label)} — Only ${avail} left`;
    if (addBtn) { addBtn.disabled = false; addBtn.textContent = "Add to bag"; }
    if (incBtn) incBtn.disabled = false;
    if (currentModalQty > avail) {
      currentModalQty = avail;
      const qtyEl = $("#modalQtyVal");
      if (qtyEl) qtyEl.textContent = avail;
    }
  } else {
    alertEl.className += " in-stock";
    alertEl.innerHTML = `🟢 In stock (${avail} available)`;
    if (addBtn) { addBtn.disabled = false; addBtn.textContent = "Add to bag"; }
    if (incBtn) incBtn.disabled = false;
  }
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
    oatmeal: "#DDD4C5", "space grey": "#4A4D52"
  };
  const key = String(colorName || "").toLowerCase().trim();
  return map[key] || "#999999";
}

/* ============================================================
   CART LOGIC (WITH SIZES & COLORS)
   ============================================================ */
function addToCart(id, size = "", color = "", qty = 1) {
  const p = getProduct(id);
  if (!p || p.stock === "out_of_stock") return;

  const key = makeCartKey(id, size, color);

  // ── OVERSELLING GUARD ──────────────────────────────────────
  if (typeof getAvailableStock === "function") {
    const avail = getAvailableStock(id, size, color);
    const alreadyInCart = cart[key]?.qty || 0;
    if (avail <= 0) {
      showToast(`🔴 Sorry, this variant is out of stock.`, "error");
      return;
    }
    if (alreadyInCart + qty > avail) {
      const canAdd = avail - alreadyInCart;
      if (canAdd <= 0) {
        showToast(`Only ${avail} available — you already have ${alreadyInCart} in your bag.`, "error");
        return;
      }
      qty = canAdd;
      showToast(`Only ${avail} available. Added ${canAdd} to your bag.`);
    }
  }
  // ──────────────────────────────────────────────────────────

  if (cart[key]) {
    cart[key].qty += qty;
  } else {
    cart[key] = { id, qty, size, color };
  }
  saveCart();
  renderCart();

  let details = p.name;
  if (size || color) {
    const parts = [size ? `Size: ${size}` : "", color ? `Color: ${color}` : ""].filter(Boolean);
    details += ` (${parts.join(", ")})`;
  }
  showToast(`${details} added to bag!`);
}

function changeQty(cartKey, delta) {
  if (!cart[cartKey]) return;
  // ── OVERSELLING GUARD on + ─────────────────────────────────
  if (delta > 0 && typeof getAvailableStock === "function") {
    const item = cart[cartKey];
    const avail = getAvailableStock(item.id, item.size || "", item.color || "");
    if (item.qty >= avail) {
      showToast(`Only ${avail} available.`, "error");
      return;
    }
  }
  // ──────────────────────────────────────────────────────────
  cart[cartKey].qty += delta;
  if (cart[cartKey].qty <= 0) delete cart[cartKey];
  saveCart();
  renderCart();
}


function removeFromCart(cartKey) {
  delete cart[cartKey];
  saveCart();
  renderCart();
}

function renderCart() {
  const count = cartTotalQty();
  $("#cartCount").textContent = count;

  const itemsEl = $("#cartItems");
  const emptyEl = $("#cartEmpty");
  const summaryEl = $("#cartSummary");

  const entries = Object.entries(cart);

  if (entries.length === 0) {
    itemsEl.innerHTML = "";
    itemsEl.style.display = "none";
    emptyEl.style.display = "flex";
    summaryEl.style.display = "none";
    return;
  }

  itemsEl.style.display = "block";
  emptyEl.style.display = "none";
  summaryEl.style.display = "block";

  itemsEl.innerHTML = entries
    .map(([key, item]) => {
      const p = getProduct(item.id);
      if (!p) return "";
      const variants = [item.size ? `Size: ${item.size}` : "", item.color ? `Color: ${item.color}` : ""].filter(Boolean);
      return `
        <div class="cart-item">
          <img src="${escHtml(p.image)}" alt="${escHtml(p.name)}">
          <div class="cart-item-info">
            <div class="cart-item-name">${escHtml(p.name)}</div>
            ${variants.length ? `<div class="cart-item-variant">${escHtml(variants.join(" • "))}</div>` : ""}
            <div class="cart-item-price">${money(p.price)}</div>
            <div class="cart-item-qty">
              <button class="qty-btn" data-action="dec" data-key="${escHtml(key)}">−</button>
              <span>${item.qty}</span>
              <button class="qty-btn" data-action="inc" data-key="${escHtml(key)}">+</button>
              <button class="cart-item-remove" data-action="remove" data-key="${escHtml(key)}">Remove</button>
            </div>
          </div>
        </div>`;
    })
    .join("");

  itemsEl.querySelectorAll("[data-action]").forEach((btn) => {
    const key = btn.dataset.key;
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "inc") changeQty(key, 1);
      if (action === "dec") changeQty(key, -1);
      if (action === "remove") removeFromCart(key);
    });
  });

  $("#cartSubtotal").textContent = money(cartSubtotal());
}

/* ============================================================
   DRAWER & CHECKOUT MODAL
   ============================================================ */
function openDrawer() {
  $("#cartDrawer").classList.add("open");
  $("#drawerOverlay").classList.add("open");
}
function closeDrawer() {
  $("#cartDrawer").classList.remove("open");
  $("#drawerOverlay").classList.remove("open");
}


function openCheckout() {
  if (cartTotalQty() === 0) return;
  const lines = Object.values(cart)
    .map((item) => {
      const p = getProduct(item.id);
      if (!p) return "";
      const varInfo = [
        item.size  ? `Size: ${escHtml(item.size)}`  : "",
        item.color ? `Color: ${escHtml(item.color)}` : ""
      ].filter(Boolean);
      const varStr = varInfo.length ? ` <small>(${varInfo.join(", ")})</small>` : "";
      return `<strong>${item.qty}×</strong> ${escHtml(p.name)}${varStr} — ${money(p.price * item.qty)}`;
    })
    .filter(Boolean)
    .join("<br>");

  const total = cartSubtotal();
  $("#modalSummary").innerHTML = `${lines}<br><br><strong>Total: ${money(total)}</strong>`;
  $("#checkoutOverlay").classList.add("open");
}
function closeCheckout() {
  $("#checkoutOverlay").classList.remove("open");
}

/* ============================================================
   ORDERS STORAGE (ff_orders) & PDF PROOF GENERATOR
   ============================================================ */
const ORDERS_KEY = "ff_orders";
let lastPlacedOrder = null;

function loadOrders() {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]"); } catch { return []; }
}
function saveOrders(arr) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(arr));
}
function generateOrderId() {
  const n = (loadOrders().length + 1).toString().padStart(4, "0");
  return `ORD-${n}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

/* ─── STANDALONE PURE JS PDF BUILDER (100% OFFLINE SAFE) ─── */
function generateRawPdfBlob(order, settings) {
  const shopName = (settings && settings.shopName) || "Ferry & Fable";
  const shopPhone = (settings && settings.whatsapp) || "+880 1700000000";
  const orderId = order.id || "ORD-" + Date.now();
  const dObj = new Date(order.date || Date.now());
  const dateStr = dObj.toLocaleDateString("en-BD", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = dObj.toLocaleTimeString("en-BD", { hour: "2-digit", minute: "2-digit" });

  const cust = order.customer || {};
  const custName = cust.name || "Valued Customer";
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
    stream += "BT /F2 8.5 Tf 55 " + (curY - 2) + " Td (If your delivery is delayed or you have questions, show this invoice or Order ID #" + cleanStr(orderId) + ") Tj ET\n";
  }
  stream += "0.25 0.30 0.35 rg\n";
  stream += "BT /F2 8.5 Tf 55 " + (curY - 16) + " Td (to our store owner on WhatsApp: " + cleanStr(shopPhone) + " for immediate resolution.) Tj ET\n";

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

/* Lazy-load jsPDF on demand — only fetched when user triggers PDF download */
function ensureJsPDF() {
  return new Promise((resolve) => {
    if (window.jspdf && window.jspdf.jsPDF) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.integrity = "sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==";
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => { console.warn("jsPDF CDN load failed — using fallback PDF"); resolve(); };
    document.head.appendChild(s);
  });
}

async function downloadOrderPdf(order, settings) {
  await ensureJsPDF();

  const s = settings || (typeof getSettings === "function" ? getSettings() : {});
  const shopName = s.shopName || "Ferry & Fable";
  const shopPhone = s.whatsapp || "+880 1700000000";
  const orderId = order.id || ("ORD-" + Date.now());
  const dObj = new Date(order.date || Date.now());
  const dateStr = dObj.toLocaleDateString("en-BD", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = dObj.toLocaleTimeString("en-BD", { hour: "2-digit", minute: "2-digit" });

  const cust = order.customer || {};
  const custName = cust.name || "Customer";
  const custPhone = cust.phone || "—";
  const custAddress = cust.address || "—";
  const payment = order.payment || "Cash on Delivery";
  const items = order.items || [];
  const total = order.total || 0;
  const isPaid = order.paymentStatus === "paid" || order.isPaid === true;

  let blob = null;

  // 1. Try jsPDF if available
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
      const splitAddr = doc.splitTextToSize(`Address: ${custAddress}`, colW - 24);
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
      doc.text(doc.splitTextToSize(custName, colW - 28)[0] || custName, 54, y + 38);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Phone: ${custPhone}`, 54, y + 52);
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
      doc.text(`Payment Method: ${payment}`, b2x, y + 52);

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
        const guaranteeTxt = `If delivery is delayed, send this Order ID #${orderId} to WhatsApp (${shopPhone}) for resolution.`;
        doc.text(doc.splitTextToSize(guaranteeTxt, pw - 110)[0] || guaranteeTxt, 55, y + 45);
      }

      doc.setDrawColor(226, 232, 240);
      doc.line(40, 785, pw - 40, 785);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(7.5);
      doc.text(`${shopName} • Everyday Essentials • WhatsApp: ${shopPhone}`, pw / 2, 798, { align: "center" });
      blob = doc.output("blob");
    } catch (e) {
      console.warn("jsPDF error, using fallback raw PDF:", e);
    }
  }

  if (!blob) blob = generateRawPdfBlob(order, s);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Order-Proof-${orderId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  showToast("📄 Order proof PDF downloaded! Keep as proof of order.", "success");
}

/* ============================================================
   CHECKOUT SUBMIT -> DUAL MODE: WEB ORDER OR WHATSAPP
   ============================================================ */
async function handleCheckoutSubmit(e) {
  e.preventDefault();

  // Anti-spam honeypot verification
  const honeypot = document.getElementById("hpWebsite")?.value || document.querySelector('[name="website"]')?.value;
  if (honeypot) {
    console.warn("Spam submission blocked by honeypot filter.");
    return;
  }

  const name    = $("#custName").value.trim();
  const phone   = $("#custPhone").value.trim();
  const address = $("#custAddress").value.trim();
  const payment = ($("#custPayment")?.value) || "Cash on Delivery";
  const method  = (document.querySelector('input[name="orderMethod"]:checked') || {}).value || "whatsapp";

  const liveSettings  = getSettings();
  const currentShopName = liveSettings.shopName || SHOP_NAME;
  const cartItems = Object.values(cart).map(item => {
    const p = getProduct(item.id);
    if (!p) return null;
    return { id: item.id, name: p.name, price: p.price, qty: item.qty, size: item.size || "", color: item.color || "", image: p.image || "" };
  }).filter(Boolean);
  const total = cartSubtotal();

  /* ---- STOCK FULFILLMENT CHECK (Both Web & WhatsApp) ---- */
  if (typeof checkOrderFulfillment === "function") {
    const stockErrors = checkOrderFulfillment(cartItems);
    if (stockErrors.length > 0) {
      alert("⚠️ Stock issue:\n\n" + stockErrors.join("\n") + "\n\nPlease update your bag and try again.");
      return;
    }
  }

  if (method === "inweb") {
    const orderId = generateOrderId();
    const newOrder = {
      id: orderId,
      date: new Date().toISOString(),
      customer: { name, phone, address },
      payment,
      items: cartItems,
      total,
      status: "pending"
    };

    const orders = loadOrders();
    orders.unshift(newOrder);
    saveOrders(orders);

    // Save directly to MongoDB Atlas
    fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newOrder)
    }).catch(e => console.warn("MongoDB order save notice:", e));

    if (typeof handleOrderStatusStockTransition === "function") {
      handleOrderStatusStockTransition(newOrder, "", "pending", "Storefront Customer");
    }

    renderProducts();
    lastPlacedOrder = newOrder;

    // 🚀 AUTOMATICALLY DOWNLOAD ORDER PROOF AS PDF!
    setTimeout(() => {
      downloadOrderPdf(newOrder, liveSettings);
    }, 250);

    // Show success modal
    $("#successOrderId").textContent = "#" + orderId;
    $("#successCustName").textContent = name;
    const box = $("#successSummaryBox");
    box.innerHTML =
      cartItems.map(it => {
        const varParts = [it.size ? `Size: ${it.size}` : "", it.color ? `Color: ${it.color}` : ""].filter(Boolean);
        return `<div class="order-line-row">
          <span>${escHtml(it.name)}${varParts.length ? ` <small>(${escHtml(varParts.join(", "))})</small>` : ""} ×${it.qty}</span>
          <span>${money(it.price * it.qty)}</span>
        </div>`;
      }).join("") +
      `<div class="order-total-row"><span>Total</span><span>${money(total)}</span></div>`;

    closeCheckout();
    $("#orderSuccessModal").classList.add("open");

    // Wire PDF re-download button
    if ($("#successDownloadPdfBtn")) {
      $("#successDownloadPdfBtn").onclick = () => {
        downloadOrderPdf(newOrder, getSettings());
      };
    }

    // Wire WhatsApp proof button
    if ($("#successOwnerWaBtn")) {
      const cleanWa = getCleanWhatsAppNumber(liveSettings.whatsapp || WHATSAPP_NUMBER);
      const waMsg = `Hello ${currentShopName},\nI have placed order #${orderId} on your website on ${new Date().toLocaleDateString()}.\nCustomer: ${name} (${phone})\nDelivery Address: ${address}\nTotal: Tk ${Number(total).toLocaleString()}\nI have my downloaded PDF proof of order. Could you please confirm my delivery status?`;
      $("#successOwnerWaBtn").onclick = () => {
        window.open(`https://wa.me/${cleanWa}?text=${encodeURIComponent(waMsg)}`, "_blank");
      };
    }

    cart = {};
    saveCart();
    renderCart();
    closeDrawer();
    $("#checkoutForm").reset();

  } else {
    /* ---- WHATSAPP ORDER ---- */

    const targetWhatsApp = getCleanWhatsAppNumber(liveSettings.whatsapp || WHATSAPP_NUMBER);
    const itemLines = cartItems.map(it => {
      const varParts = [it.size ? `Size: ${it.size}` : "", it.color ? `Color: ${it.color}` : ""].filter(Boolean);
      return `- ${it.name}${varParts.length ? ` (${varParts.join(", ")})` : ""} x${it.qty} = ${money(it.price * it.qty)}`;
    }).join("\n");


    const message =
      `New order from ${currentShopName} website\n\n` +
      `Name: ${name}\n` +
      `Phone: ${phone}\n` +
      `Address: ${address}\n` +
      `Payment: ${payment}\n\n` +
      `Items:\n${itemLines}\n\n` +
      `Total: ${money(total)}`;

    const url = `https://wa.me/${targetWhatsApp}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");

    cart = {};
    saveCart();
    renderCart();
    closeCheckout();
    closeDrawer();
    $("#checkoutForm").reset();
    showToast("Order sent! Check WhatsApp to confirm.");
  }
}

/* ============================================================
   ORDER TRACKING & SEARCH BY ORDER ID
   ============================================================ */
async function searchAndRenderTrackOrder(rawInput) {
  const query = (rawInput || "").trim().toUpperCase().replace(/^#/, "");
  const container = $("#trackResultContainer");
  if (!container) return;

  if (!query) {
    container.style.display = "block";
    container.innerHTML = `<p style="color:var(--red,#ef4444);font-size:.86rem;padding:8px 0">Please enter a valid Order ID (e.g. ORD-0001).</p>`;
    return;
  }

  // Read the phone number from the new verification field
  const trackPhone = (($("#trackPhoneInput") || {}).value || "").trim();
  const allOrders = loadOrders();
  const localMatch = allOrders.find(o => {
    const cleanId = (o.id || "").toUpperCase().replace(/^#/, "");
    return cleanId === query || cleanId.endsWith(query) || (o.id || "").toUpperCase().includes(query);
  });

  let found = null;
  if (localMatch) {
    // If phone was provided and matches, unmask; otherwise mask customer details
    const storedPhone = (localMatch.customer?.phone || "").replace(/\D/g, "");
    const cleanQueryPhone = (trackPhone || "").replace(/\D/g, "");
    const isPhoneMatched = cleanQueryPhone.length >= 6 && storedPhone.includes(cleanQueryPhone);
    found = {
      ...localMatch,
      masked: !isPhoneMatched,
      customer: isPhoneMatched ? localMatch.customer : null
    };
  }

  container.style.display = "block";

  if (!found) {
    container.innerHTML = `
      <div class="track-not-found" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;text-align:center">
        <p style="font-weight:700;color:#991b1b;margin-bottom:6px">Order Not Found</p>
        <p style="font-size:.84rem;color:#7f1d1d;line-height:1.5">No order matches <strong>#${escHtml(query)}</strong>.<br>Please double check the Order ID and phone number entered.</p>
      </div>`;
    return;
  }

  const d = new Date(found.date);
  const dateStr = d.toLocaleDateString("en-BD", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = d.toLocaleTimeString("en-BD", { hour: "2-digit", minute: "2-digit" });

  const scMap = {
    pending:   { label: "Pending Confirmation", bg: "#fef3c7", text: "#92400e" },
    confirmed: { label: "Confirmed",            bg: "#dbeafe", text: "#1e40af" },
    shipped:   { label: "Shipped / On the Way", bg: "#ede9fe", text: "#5b21b6" },
    delivered: { label: "Delivered",            bg: "#d1fae5", text: "#065f46" },
    cancelled: { label: "Cancelled",            bg: "#fee2e2", text: "#991b1b" }
  };
  const sc = scMap[found.status] || scMap.pending;

  const itemsHtml = (found.items || []).map(it => {
    const varArr = [it.size ? `Size: ${it.size}` : "", it.color ? `Color: ${it.color}` : ""].filter(Boolean);
    return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px dashed var(--line);font-size:.86rem">
      <span>${escHtml(it.name)}${varArr.length ? ` <small style="color:var(--ink-soft)">(${escHtml(varArr.join(", "))})</small>` : ""} ×${it.qty}</span>
      <strong style="color:var(--navy)">৳${(it.price * it.qty).toLocaleString()}</strong>
    </div>`;
  }).join("");

  const settings = getSettings();
  const shopName = settings.shopName || "Ferry & Fable";
  const shopWa = getCleanWhatsAppNumber(settings.whatsapp || WHATSAPP_NUMBER);
  const custName  = (found.customer && found.customer.name)    ? found.customer.name    : "Customer";
  const custPhone = (found.customer && found.customer.phone)   ? found.customer.phone   : "—";
  const custAddr  = (found.customer && found.customer.address) ? found.customer.address : "—";
  const waDelayMsg = `Hello ${shopName},\nI am inquiring about my order #${found.id} placed on ${dateStr} at ${timeStr}.\nCustomer Name: ${custName}\nPhone: ${custPhone}\nDelivery Address: ${custAddr}\nTotal Amount: Tk ${Number(found.total || 0).toLocaleString()}\nI have not received an update yet — could you please check my order status?`;

  const isPaid = found.paymentStatus === "paid" || found.isPaid === true;

  const statusLower = (found.status || "pending").toLowerCase();
  const isCancelled = statusLower === "cancelled";
  const isDelivered = statusLower === "delivered";
  const isShipped = isDelivered || statusLower === "shipped";
  const isConfirmed = isShipped || statusLower === "confirmed";

  let timelineHtml = "";
  if (isCancelled) {
    timelineHtml = `<div class="track-cancelled-alert">⚠️ This order was cancelled. Any reserved items were returned to stock.</div>`;
  } else {
    timelineHtml = `
      <div class="track-timeline">
        <div class="track-step completed">
          <div class="step-dot">✓</div>
          <span class="step-label">Placed</span>
        </div>
        <div class="track-step-line ${isConfirmed ? 'active' : ''}"></div>
        <div class="track-step ${isConfirmed ? 'completed' : 'active'}">
          <div class="step-dot">${isConfirmed ? '✓' : '2'}</div>
          <span class="step-label">Confirmed</span>
        </div>
        <div class="track-step-line ${isShipped ? 'active' : ''}"></div>
        <div class="track-step ${isShipped ? 'completed' : (statusLower === 'confirmed' ? 'active' : '')}">
          <div class="step-dot">${isShipped ? '✓' : '3'}</div>
          <span class="step-label">Shipped</span>
        </div>
        <div class="track-step-line ${isDelivered ? 'active' : ''}"></div>
        <div class="track-step ${isDelivered ? 'completed' : (statusLower === 'shipped' ? 'active' : '')}">
          <div class="step-dot">${isDelivered ? '✓' : '4'}</div>
          <span class="step-label">Delivered</span>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="track-order-card" style="background:#fff;border:1.5px solid var(--line);border-radius:12px;padding:18px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--line)">
        <div>
          <strong style="font-size:1.1rem;color:var(--navy);font-family:var(--font-display)">#${escHtml(found.id)}</strong>
          <div style="font-size:.78rem;color:var(--ink-soft)">Placed on ${dateStr} at ${timeStr}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span style="background:${sc.bg};color:${sc.text};padding:4px 10px;border-radius:999px;font-size:.78rem;font-weight:700;text-transform:uppercase">${sc.label}</span>
          ${isPaid ? '<span style="background:#d1fae5;color:#065f46;padding:4px 10px;border-radius:999px;font-size:.78rem;font-weight:700">PAID ✓</span>' : '<span style="background:#fef3c7;color:#92400e;padding:4px 10px;border-radius:999px;font-size:.78rem;font-weight:700">UNPAID</span>'}
        </div>
      </div>

      ${timelineHtml}

      ${found.masked ? `
      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 14px;margin-bottom:12px;font-size:.84rem;line-height:1.5">
        <div style="font-weight:700;color:#92400e;margin-bottom:4px">🔒 Customer Information Protected</div>
        <div style="color:#78350f">Customer name, phone, and delivery address are hidden for privacy. Enter the checkout phone number above and click <strong>Search</strong> to verify your identity and view complete details.</div>
      </div>
      ` : `
      <div style="background:var(--paper,#f9f7f4);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:.84rem;line-height:1.5">
        <div><strong>Customer:</strong> ${escHtml(custName)} · 📞 ${escHtml(custPhone)}</div>
        <div style="color:var(--ink-soft)">📍 ${escHtml(custAddr)}</div>
        <div style="margin-top:2px">💳 <strong>Payment:</strong> ${escHtml(found.payment || "Cash on Delivery")} ${isPaid ? '<strong style="color:#065f46;margin-left:4px">(Paid ✓)</strong>' : '<span style="color:#b45309;margin-left:4px">(Due on Delivery)</span>'}</div>
      </div>
      `}

      <div style="margin-bottom:12px">${itemsHtml}</div>

      <div style="display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:1.05rem;color:var(--navy);margin-bottom:16px;padding-top:8px;border-top:2px solid var(--line)">
        <div>
          <span>Payable</span>
          ${isPaid ? '<span style="display:block;font-size:.74rem;color:#166534;font-weight:700">✓ PAYMENT RECEIVED</span>' : '<span style="display:block;font-size:.74rem;color:#b45309;font-weight:600">DUE ON DELIVERY</span>'}
        </div>
        <span style="${isPaid ? 'color:#166534' : ''}">৳${(found.total || 0).toLocaleString()}</span>
      </div>

      <!-- Proof Guarantee Notice -->
      <div style="background:#fef2f2;border:1px solid #fee2e2;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:.81rem;color:#7f1d1d">
        <strong>Delayed or need urgent response?</strong>
        <p style="margin:2px 0 0">Click the button below to message our store owner directly on WhatsApp with your proof of order.</p>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <button type="button" class="btn btn-secondary btn-block" id="trackCardPdfBtn">⬇️ Download Official PDF Proof</button>
        <a href="https://wa.me/${shopWa}?text=${encodeURIComponent(waDelayMsg)}" target="_blank" class="btn btn-ghost btn-block" style="border:1.5px solid #25d366;color:#128c7e;text-align:center;font-weight:600">💬 Inquire with Owner on WhatsApp</a>
      </div>
    </div>
  `;

  // Wire Download PDF button
  const pdfBtn = container.querySelector("#trackCardPdfBtn");
  if (pdfBtn) {
    pdfBtn.onclick = () => {
      if (found.masked) {
        alert("Please enter the phone number you used at checkout above and click Search to verify ownership before downloading your receipt.");
        $("#trackPhoneInput")?.focus();
        return;
      }
      downloadOrderPdf(found, getSettings());
    };
  }
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  _settings = getSettings();
  SHOP_NAME = _settings.shopName || "Ferry & Fable";
  WHATSAPP_NUMBER = getCleanWhatsAppNumber(_settings.whatsapp || "8801700000000");
  CURRENCY = _settings.currency || "৳";

  // Fetch live products from MongoDB Atlas
  fetch("/api/products")
    .then(r => r.ok ? r.json() : [])
    .then(prods => {
      if (Array.isArray(prods)) {
        window.ffProductCache = prods;
        localStorage.setItem("ff_products", JSON.stringify(prods));
        renderDepartmentTabs();
        renderCategories();
        renderProducts();
      }
    })
    .catch(err => console.warn("MongoDB storefront load notice:", err));

  // Native cross-tab sync when owner updates catalog/settings from dashboard
  window.addEventListener("storage", (e) => {
    if (e.key === "ff_products" || e.key === "ff_departments" || e.key === "ff_categories") {
      renderDepartmentTabs();
      renderCategories();
      renderProducts();
      renderCart();
    } else if (e.key === "ff_settings") {
      _settings = getSettings();
      SHOP_NAME = _settings.shopName || "Ferry & Fable";
      WHATSAPP_NUMBER = getCleanWhatsAppNumber(_settings.whatsapp || "8801700000000");
      CURRENCY = _settings.currency || "৳";
      renderProducts();
    } else if (e.key === "ff_hero") {
      applyHeroAndShowcase();
    }
  });
  $("#year").textContent = new Date().getFullYear();

  // ── Apply Logo from settings ──────────────────────────────
  const logoUrl = _settings.logoUrl || "";
  if (logoUrl) {
    if ($("#siteLogoImg"))  { $("#siteLogoImg").src = logoUrl; $("#siteLogoImg").style.display = "inline-block"; }
    if ($("#siteLogoText")) $("#siteLogoText").style.display = "none";
    if ($("#footerLogoImg"))  { $("#footerLogoImg").src = logoUrl; $("#footerLogoImg").style.display = "block"; }
    if ($("#footerLogoText")) $("#footerLogoText").style.display = "none";
  } else {
    // Escape shopName before injecting into innerHTML (XSS prevention)
    const shopNameRaw = escHtml(_settings.shopName || "Ferry & Fable");
    const formatted = shopNameRaw.replace(/\s*&amp;\s*/g, " <span>&amp;</span> ");
    if ($("#siteLogoText"))  {
      $("#siteLogoText").innerHTML = `<p class="logo-name">${formatted}</p><span class="brand-tag">Everyday Essentials</span>`;
      $("#siteLogoText").style.display = "inline-flex";
    }
    if ($("#footerLogoText")) {
      $("#footerLogoText").innerHTML = `<p class="logo-name">${formatted}</p><span class="brand-tag">Everyday Essentials</span>`;
      $("#footerLogoText").style.display = "inline-flex";
    }
  }


  // Update footer contacts from settings
  if ($("#footerPhone")) {
    const rawWa = _settings.whatsapp || "+880 1700000000";
    $("#footerPhone").textContent = rawWa;
    $("#footerPhone").href = `tel:${rawWa.replace(/\s+/g, "")}`;
  }
  if ($("#footerWa")) {
    const cleanWa = getCleanWhatsAppNumber(_settings.whatsapp || "8801700000000");
    $("#footerWa").href = `https://wa.me/${cleanWa}`;
  }

  applyHeroAndShowcase();
  renderDepartmentTabs();
  renderCategories();
  renderProducts();
  renderCart();

  // ── Deep link: ?product=ID opens that product modal on load ─
  const urlParams = new URLSearchParams(window.location.search);
  const deepLinkId = urlParams.get("product");
  if (deepLinkId) {
    // wait for render
    setTimeout(() => { openProductModal(deepLinkId); }, 80);
  }

  // Cart toggles
  $("#cartToggle").addEventListener("click", openDrawer);
  $("#cartClose").addEventListener("click", closeDrawer);
  $("#drawerOverlay").addEventListener("click", closeDrawer);
  $("#cartEmptyBrowse").addEventListener("click", closeDrawer);

  // Checkout
  $("#checkoutBtn").addEventListener("click", openCheckout);
  $("#checkoutClose").addEventListener("click", closeCheckout);
  $("#checkoutOverlay").addEventListener("click", (e) => {
    if (e.target === $("#checkoutOverlay")) closeCheckout();
  });
  $("#checkoutForm").addEventListener("submit", handleCheckoutSubmit);

  // Order Method Card toggle (Direct Web vs WhatsApp)
  document.querySelectorAll('input[name="orderMethod"]').forEach(radio => {
    radio.addEventListener("change", () => {
      document.querySelectorAll(".order-method-card").forEach(c => c.classList.remove("active"));
      radio.closest(".order-method-card").classList.add("active");
      const isWeb = radio.value === "inweb";
      const btn = $("#checkoutSubmitBtn");
      const sub = $("#checkoutModalSub");
      if (btn) btn.textContent = isWeb ? "Confirm & Place Web Order" : "Send Order on WhatsApp 💬";
      if (sub) sub.textContent = isWeb
        ? "Your order will be saved directly to our store dashboard."
        : "We'll open WhatsApp with your order pre-filled. You just hit send.";
    });
  });

  // Order Success Modal close
  if ($("#successCloseBtn")) {
    $("#successCloseBtn").addEventListener("click", () => {
      $("#orderSuccessModal").classList.remove("open");
      showToast("✓ Order placed! We'll contact you soon.", "success");
    });
  }
  if ($("#orderSuccessModal")) {
    $("#orderSuccessModal").addEventListener("click", (e) => {
      if (e.target === $("#orderSuccessModal")) $("#orderSuccessModal").classList.remove("open");
    });
  }


  // Search products or Order IDs
  $("#searchInput").addEventListener("input", (e) => {
    const val = e.target.value.trim();
    if (/^#?ord-/i.test(val)) {
      openTrackModal(val);
      return;
    }
    searchTerm = val.toLowerCase();
    renderProducts();
  });

  // ── Track Order Modal Wiring ──────────────────────────────
  function openTrackModal(prefill = "") {
    const modal = $("#trackOrderModal");
    if (!modal) return;
    const inp = $("#trackOrderIdInput");
    if (inp) {
      inp.value = prefill;
      if (prefill) searchAndRenderTrackOrder(prefill);
      else {
        const res = $("#trackResultContainer");
        if (res) { res.innerHTML = ""; res.style.display = "none"; }
      }
    }
    modal.classList.add("open");
  }
  function closeTrackModal() {
    const modal = $("#trackOrderModal");
    if (modal) modal.classList.remove("open");
  }

  if ($("#navTrackOrderBtn"))    $("#navTrackOrderBtn").addEventListener("click", () => openTrackModal());
  if ($("#footerTrackOrderBtn")) $("#footerTrackOrderBtn").addEventListener("click", () => openTrackModal());
  if ($("#trackModalClose"))     $("#trackModalClose").addEventListener("click", closeTrackModal);
  if ($("#trackOrderModal")) {
    $("#trackOrderModal").addEventListener("click", (e) => {
      if (e.target === $("#trackOrderModal")) closeTrackModal();
    });
  }
  if ($("#trackSearchBtn")) {
    $("#trackSearchBtn").addEventListener("click", () => {
      const inp = $("#trackOrderIdInput");
      searchAndRenderTrackOrder(inp ? inp.value : "");
    });
  }
  if ($("#trackOrderIdInput")) {
    $("#trackOrderIdInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        searchAndRenderTrackOrder(e.target.value);
      }
    });
  }
  // Also allow submitting from the phone field with Enter
  if ($("#trackPhoneInput")) {
    $("#trackPhoneInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        searchAndRenderTrackOrder(($("#trackOrderIdInput") || {}).value || "");
      }
    });
  }

  // Mobile nav
  $("#navToggle").addEventListener("click", () => {
    const nav = $("#mainNav");
    const expanded = nav.classList.toggle("mobile-open");
    $("#navToggle").setAttribute("aria-expanded", expanded);
  });
  $$(".main-nav .nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      $("#mainNav").classList.remove("mobile-open");
      if (link.dataset.navDept) {
        activeDepartment = link.dataset.navDept;
        activeCategory = "all";
        renderDepartmentTabs();
        renderCategories();
        renderProducts();
      }
    });
  });

  // Department Showcase buttons
  if ($("#menShowcaseBtn")) {
    $("#menShowcaseBtn").onclick = () => {
      activeDepartment = "Men";
      activeCategory = "all";
      renderDepartmentTabs();
      renderCategories();
      renderProducts();
      document.querySelector("#shop").scrollIntoView({ behavior: "smooth" });
    };
  }
  if ($("#menShowcaseCard")) {
    $("#menShowcaseCard").onclick = (e) => {
      if (!e.target.closest("button")) {
        activeDepartment = "Men";
        activeCategory = "all";
        renderDepartmentTabs();
        renderCategories();
        renderProducts();
        document.querySelector("#shop").scrollIntoView({ behavior: "smooth" });
      }
    };
  }
  if ($("#womenShowcaseBtn")) {
    $("#womenShowcaseBtn").onclick = () => {
      activeDepartment = "Women";
      activeCategory = "all";
      renderDepartmentTabs();
      renderCategories();
      renderProducts();
      document.querySelector("#shop").scrollIntoView({ behavior: "smooth" });
    };
  }
  if ($("#womenShowcaseCard")) {
    $("#womenShowcaseCard").onclick = (e) => {
      if (!e.target.closest("button")) {
        activeDepartment = "Women";
        activeCategory = "all";
        renderDepartmentTabs();
        renderCategories();
        renderProducts();
        document.querySelector("#shop").scrollIntoView({ behavior: "smooth" });
      }
    };
  }

  // Product detail modal interactions
  if ($("#productModalClose")) {
    $("#productModalClose").onclick = closeProductModal;
  }
  if ($("#productDetailModal")) {
    $("#productDetailModal").onclick = (e) => {
      if (e.target === $("#productDetailModal")) closeProductModal();
    };
  }
  if ($("#qtyDecBtn")) {
    $("#qtyDecBtn").onclick = () => {
      if (currentModalQty > 1) {
        currentModalQty--;
        $("#modalQtyVal").textContent = currentModalQty;
      }
    };
  }
  if ($("#qtyIncBtn")) {
    $("#qtyIncBtn").onclick = () => {
      if (!currentModalProduct) return;
      // Cap at available stock only if stock system is active
      const isTracked = (typeof isStockSystemActive === "function") ? isStockSystemActive(currentModalProduct) : true;
      if (isTracked && typeof getAvailableStock === "function") {
        const avail = getAvailableStock(currentModalProduct.id, currentModalSize, currentModalColor);
        if (currentModalQty >= avail) {
          showToast(`Only ${avail} available.`, "error");
          return;
        }
      }
      currentModalQty++;
      $("#modalQtyVal").textContent = currentModalQty;
    };
  }
  if ($("#modalAddToCartBtn")) {
    $("#modalAddToCartBtn").onclick = () => {
      if (!currentModalProduct || currentModalProduct.stock === "out_of_stock") return;
      if (currentModalQty <= 0) return;
      addToCart(currentModalProduct.id, currentModalSize, currentModalColor, currentModalQty);
      closeProductModal();
      openDrawer();
    };
  }


  // Share product link button
  if ($("#modalShareBtn")) {
    $("#modalShareBtn").onclick = () => {
      if (!currentModalProduct) return;
      const base = window.location.href.split("?")[0].split("#")[0];
      const link = `${base}?product=${currentModalProduct.id}`;
      navigator.clipboard.writeText(link).then(() => {
        const msg = $("#shareCopiedMsg");
        if (msg) { msg.style.display = "inline"; setTimeout(() => msg.style.display = "none", 2500); }
      }).catch(() => {
        // Graceful fallback: prompt user to copy manually
        window.prompt("Copy this product link:", link);
      });
    };
  }

  // Keyboard navigation (Escape closes drawers & modals)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDrawer();
      closeCheckout();
      closeProductModal();
      if ($("#trackOrderModal")) $("#trackOrderModal").classList.remove("open");
      if ($("#policyModal")) $("#policyModal").classList.remove("open");
    }
  });
}

/* ============================================================
   CUSTOMER CARE & STORE POLICIES MODAL
   ============================================================ */
const POLICIES_DATA = {
  returns: `
    <h3 style="margin:0 0 10px;font-size:1.15rem;color:var(--navy);font-family:var(--font-display)">Returns &amp; Exchanges Policy</h3>
    <p>We want you to be completely delighted with your purchase. If you receive an item with any defect or sizing mismatch:</p>
    <ul style="list-style:disc;padding-left:20px;margin:10px 0;display:flex;flex-direction:column;gap:6px">
      <li><strong>7-Day Replacement:</strong> You may request an exchange or replacement within 7 calendar days of receiving your order.</li>
      <li><strong>Doorstep Inspection:</strong> On Cash on Delivery, you may inspect the package in front of the courier agent before accepting.</li>
      <li><strong>Condition:</strong> Items must be unworn, unwashed, and in original packaging with brand tags intact.</li>
      <li><strong>Defective or Wrong Items:</strong> If you received a defective or incorrect item, we cover 100% of return delivery fees.</li>
    </ul>
    <p style="margin-top:12px">To initiate an exchange, please message our support team on WhatsApp with your Order ID and photo proof.</p>
  `,
  shipping: `
    <h3 style="margin:0 0 10px;font-size:1.15rem;color:var(--navy);font-family:var(--font-display)">Shipping &amp; Delivery Terms</h3>
    <p>We deliver nationwide across all 64 districts in Bangladesh with reliable parcel delivery partners.</p>
    <ul style="list-style:disc;padding-left:20px;margin:10px 0;display:flex;flex-direction:column;gap:6px">
      <li><strong>Inside Dhaka:</strong> Delivery within 24 to 48 hours. Standard charge ৳60–৳80.</li>
      <li><strong>Outside Dhaka:</strong> Delivery within 3 to 5 business days. Standard charge ৳100–৳130.</li>
      <li><strong>Tracking:</strong> You can track your package anytime using your Order ID on our Track Order page.</li>
      <li><strong>Cash on Delivery (COD):</strong> Pay in cash or mobile money directly to the courier agent upon receiving your goods.</li>
    </ul>
  `,
  privacy: `
    <h3 style="margin:0 0 10px;font-size:1.15rem;color:var(--navy);font-family:var(--font-display)">Privacy Policy</h3>
    <p>Your trust is paramount. We only collect the minimal personal data required to fulfill and deliver your orders:</p>
    <ul style="list-style:disc;padding-left:20px;margin:10px 0;display:flex;flex-direction:column;gap:6px">
      <li><strong>Collected Details:</strong> Customer name, phone number, and delivery address.</li>
      <li><strong>Usage:</strong> Exclusively for courier dispatch, order confirmation, and customer service follow-ups.</li>
      <li><strong>No Selling of Data:</strong> We never sell, rent, or trade your personal information to third-party marketing companies.</li>
      <li><strong>Cookies &amp; Local Storage:</strong> We use minimal browser storage solely to keep your shopping bag items between visits.</li>
    </ul>
  `,
  terms: `
    <h3 style="margin:0 0 10px;font-size:1.15rem;color:var(--navy);font-family:var(--font-display)">Terms of Service</h3>
    <p>Welcome to our online store. By browsing our catalog or placing an order, you agree to the following terms:</p>
    <ul style="list-style:disc;padding-left:20px;margin:10px 0;display:flex;flex-direction:column;gap:6px">
      <li><strong>Order Accuracy:</strong> Please ensure your phone number and address are complete and reachable for delivery calls.</li>
      <li><strong>Order Confirmation:</strong> All orders are subject to stock availability and address verification before dispatch.</li>
      <li><strong>Pricing &amp; Errors:</strong> Prices are displayed in local currency. In the event of a pricing typographical error, we will contact you before shipment.</li>
      <li><strong>Right to Refuse:</strong> We reserve the right to cancel fraudulent or non-confirmable orders.</li>
    </ul>
  `
};

window.openPolicyModal = function (tab = "returns") {
  const modal = $("#policyModal");
  if (!modal) return;
  modal.classList.add("open");
  switchPolicyTab(tab);
};

window.closePolicyModal = function () {
  const modal = $("#policyModal");
  if (modal) modal.classList.remove("open");
};

window.switchPolicyTab = function (tabKey) {
  const contentEl = $("#policyContent");
  if (contentEl) {
    contentEl.innerHTML = POLICIES_DATA[tabKey] || POLICIES_DATA.returns;
  }
  $$(".policy-tab").forEach(btn => {
    if (btn.dataset.policy === tabKey) {
      btn.classList.add("active");
      btn.style.background = "var(--navy)";
      btn.style.color = "#fff";
      btn.style.borderColor = "var(--navy)";
    } else {
      btn.classList.remove("active");
      btn.style.background = "transparent";
      btn.style.color = "var(--ink)";
      btn.style.borderColor = "var(--line)";
    }
  });
};

if ($("#policyModal")) {
  $("#policyModal").addEventListener("click", (e) => {
    if (e.target === $("#policyModal")) closePolicyModal();
  });
}

/* ============================================================
   MOBILE SEARCH PANEL WIRING
   ============================================================ */
(function wireMobileSearch() {
  const toggleBtn   = document.getElementById("mobileSearchToggle");
  const panel       = document.getElementById("mobileSearchPanel");
  const mobileInput = document.getElementById("mobileSearchInput");
  const closeBtn    = document.getElementById("mobileSearchClose");
  const desktopInput = document.getElementById("searchInput");
  if (!toggleBtn || !panel || !mobileInput) return;

  function openPanel() {
    panel.hidden = false;
    toggleBtn.setAttribute("aria-expanded", "true");
    mobileInput.focus();
  }
  function closePanel() {
    panel.hidden = true;
    toggleBtn.setAttribute("aria-expanded", "false");
    // Clear mobile search when closing
    mobileInput.value = "";
    searchTerm = "";
    renderProducts();
  }

  toggleBtn.addEventListener("click", () => {
    panel.hidden ? openPanel() : closePanel();
  });
  closeBtn && closeBtn.addEventListener("click", closePanel);

  // Sync mobile search input with main search logic
  mobileInput.addEventListener("input", () => {
    searchTerm = mobileInput.value.toLowerCase().trim();
    if (desktopInput) desktopInput.value = mobileInput.value;
    renderProducts();
  });

  // Close panel on Escape
  mobileInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });
})();


document.addEventListener("DOMContentLoaded", init);
