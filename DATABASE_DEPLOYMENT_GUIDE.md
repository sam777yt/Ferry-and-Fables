# 🗄️ Ferry & Fable — Database & Deployment Guide

> **Architecture:** Full-Stack Node.js (Express) + MongoDB Atlas Cloud + Vanilla HTML5/CSS3/JS Storefront  
> **Repository:** [https://github.com/sam777yt/Ferry-and-Fables](https://github.com/sam777yt/Ferry-and-Fables)  
> **Status:** 🟢 Production Ready & Operational  

---

## 1. 🌐 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENTS / BROWSERS                     │
│  • Customer Storefront (/)    • Owner Dashboard (/dashboard) │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
       HTTP / HTTPS                    HTTP / HTTPS
               │                               │
┌──────────────▼───────────────────────────────▼──────────────┐
│                  NODE.JS EXPRESS SERVER                     │
│  • server.js (Port 3000 / process.env.PORT)                 │
│  • Serves static assets (HTML, CSS, JS, Images)             │
│  • Exposes REST API (/api/products, /api/orders, etc.)      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                       Mongoose / TLS (27017)
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    MONGODB ATLAS (CLOUD)                    │
│  • Cluster: ferryandfable.o91tdne.mongodb.net               │
│  • Database: ferry_fable                                    │
│  • Collections: products, orders, settings                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 🗄️ Database Configuration & Credentials

### Connection Details
* **Provider:** MongoDB Atlas (AWS / Free Shared M0 Tier)
* **Cluster Host:** `ferryandfable.o91tdne.mongodb.net`
* **Database Name:** `ferry_fable`
* **Database Username:** `siamahmedsiam6418_db_user`

### Connection String Format:
```env
MONGODB_URI="mongodb+srv://siamahmedsiam6418_db_user:2r1WeSNzorOxzfEI@ferryandfable.o91tdne.mongodb.net/ferry_fable?retryWrites=true&w=majority"
```

> [!IMPORTANT]
> Never commit `.env` into git! It is guarded by `.gitignore`. When hosting on cloud platforms like **Render**, paste this connection string in the **Environment Variables** tab.

---

## 3. 📦 Database Schemas & Collections

### A. `products` Collection
Stores all catalog items displayed on the storefront.

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | String (Unique) | Unique product identifier (e.g. `p_172630...`) |
| `name` | String | Product title |
| `department` | String | Department filter (`Men`, `Women`, `Home & Living`, `All`) |
| `category` | String | Main category name |
| `subcategory` | String | Subcategory tag |
| `price` | Number | Current selling price in BDT (৳) |
| `oldPrice` | Number / null | Original price before discount (triggers `-XX% OFF` badge) |
| `image` | String | Primary image URL (Unsplash or direct CDN link) |
| `extraImages` | Array of Strings | Product gallery angles |
| `sizes` | Array of Strings | Available sizes (e.g. `["S", "M", "L", "XL"]`) |
| `colors` | Array of Strings | Available colors |
| `stock` | String | Stock status: `"in_stock"`, `"out_of_stock"`, `"hidden"` |
| `stockCount` | Number | Overall inventory quantity |
| `variantStock` | Object (Map) | Exact stock per variant key (e.g. `{"Black__M": 5}`) |
| `badge` | String | Visual card badge (e.g. `"Bestseller"`, `"Popular"`) |
| `description` | String | Full item description |
| `createdAt` | Date | Timestamp of creation |

### B. `orders` Collection
Stores all customer orders placed via the Direct Web Order flow.

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | String (Unique) | Formatted Order ID (e.g. `ORD-0001-K9X2`) |
| `date` | String / ISO Date | Order placement date and time |
| `customer` | Object | `{ name, phone, address }` |
| `payment` | String | Payment method (`Cash on Delivery`, `bKash`, `Nagad`) |
| `paymentStatus` | String | `"pending"` or `"paid"` |
| `items` | Array of Objects | Purchased items with qty, size, color, and price |
| `total` | Number | Grand total in BDT |
| `status` | String | Fulfillment status: `pending`, `confirmed`, `shipped`, `delivered`, `cancelled` |
| `createdAt` | Date | Timestamp |

### C. `settings` Collection
Stores store configurations and WhatsApp integration.

| Field | Type | Description |
| :--- | :--- | :--- |
| `shopName` | String | Official business name |
| `whatsapp` | String | Owner WhatsApp number for orders |
| `currency` | String | Currency symbol (default `৳`) |
| `deliveryFee` | Number | Standard delivery rate |
| `bannerText` | String | Promotional announcement text |
| `bannerActive` | Boolean | Whether banner is displayed |

---

## 4. 🔌 REST API Reference

All endpoints are hosted by `server.js` under `/api/*`:

### Product Routes
* `GET /api/products` — Retrieve all active products (sorted newest first).
* `GET /api/products/:id` — Retrieve a single product by ID.
* `POST /api/products` — Add a new product (used by Dashboard).
* `PUT /api/products/:id` — Update product details, price, or stock counts.
* `POST /api/products/sync` — Bulk update catalog from dashboard export/sync.
* `DELETE /api/products/:id` — Permanently delete a product.

### Order Routes
* `GET /api/orders` — List all orders for Dashboard.
* `POST /api/orders` — Save a new customer web order.
* `PUT /api/orders/:id` — Update order status or payment status.
* `DELETE /api/orders/:id` — Delete an order record.

### Store Settings Routes
* `GET /api/settings` — Get store settings and WhatsApp number.
* `POST /api/settings` — Save updated settings from dashboard.

---

## 5. 🚀 Deployment on Cloud Platforms

### Recommended: Render.com (Free Tier)
1. **Create Account:** Go to [render.com](https://render.com) and log in.
2. **New Web Service:**
   - Click **"New +"** ➔ **"Web Service"**.
   - Select repository: **`sam777yt/Ferry-and-Fables`**.
3. **Service Settings:**
   - **Name:** `ferry-and-fable`
   - **Region:** `Singapore` (Fastest for Asia / Bangladesh)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
4. **Environment Variables:**
   - Click **"Add Environment Variable"**:
     - Key: `MONGODB_URI`
     - Value: `mongodb+srv://siamahmedsiam6418_db_user:2r1WeSNzorOxzfEI@ferryandfable.o91tdne.mongodb.net/ferry_fable?retryWrites=true&w=majority`
5. Click **"Deploy Web Service"**.

---

## 6. 🔐 Security & Access Control

### MongoDB Atlas IP Whitelist (Network Access)
* In **cloud.mongodb.com ➔ Security ➔ Network Access**, IP access is set to:
  ```text
  0.0.0.0/0 (Allowed from anywhere)
  ```
* This ensures your cloud host (Render / Railway / VPS) can reach MongoDB without IP blocking.

### Dashboard Master Authentication
* **Default Password:** `admin1234` (or `admin`)
* **Password Encryption:** Uses salted **SHA-256** WebCrypto hashing.
* **To change your password:** Log into `/dashboard.html` ➔ go to **Settings** ➔ **Change Dashboard Password**.

### Anti-Spam Protection
* Checkout includes a hidden honeypot field (`#hpWebsite`). Automated spam bots submitting orders are dropped before reaching MongoDB.

---

## 7. 🛠️ Routine Maintenance & Backup

### Export Offline Backup
1. Open **`/dashboard.html`** ➔ Click **Settings** in the sidebar.
2. Scroll to **Data Management & Backups** ➔ Click **"Export JSON Backup"**.
3. A complete backup file with all products, orders, and settings will be downloaded to your computer.

### Atlas Cloud Snapshots
* MongoDB Atlas automatically manages storage compaction and point-in-time recovery.
* You can view your live database records anytime by visiting [cloud.mongodb.com](https://cloud.mongodb.com) ➔ **Database** ➔ **Browse Collections**.

---

*Documentation compiled for Ferry & Fable E-Commerce System.*
