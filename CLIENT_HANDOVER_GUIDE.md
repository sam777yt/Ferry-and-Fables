# 📦 Ferry & Fable — Production Handover & Store Owner Guide

Welcome to your new eCommerce website! This document provides a complete, step-by-step manual on how to launch your store online, connect your database, customize your brand, and manage orders day-to-day.

---

## 🚀 Quick Launch Checklist (Before Handover)

| Step | Action | Time Needed | Status |
| :--- | :--- | :--- | :--- |
| **1** | [Deploy to Free Cloud Hosting](#1-deploy-to-free-cloud-hosting-vercel--netlify) | 3 Minutes | Required |
| **2** | [Set up Free Cloud Database (Supabase)](#2-set-up-centralized-cloud-database-supabase) | 4 Minutes | Recommended |
| **3** | [Change Default Admin Password](#3-change-your-admin-password) | 1 Minute | **Critical** |
| **4** | [Set Your WhatsApp Number & Store Details](#4-set-your-business-details--whatsapp) | 2 Minutes | **Critical** |
| **5** | [Upload Your Products & Images](#5-managing-products--inventory) | As needed | Required |

---

## 1. Deploy to Free Cloud Hosting (Vercel / Netlify)

This website is built with clean HTML5, CSS3, and JavaScript, requiring **no expensive Node.js or VPS servers**. You can host it for **100% free** on global edge hosting platforms.

### Recommended: Vercel (Free & Instant)
1. Go to [vercel.com](https://vercel.com) and create a free account.
2. Drag and drop your project folder (or connect your GitHub repository).
3. Click **Deploy**. Your store is instantly live worldwide on an `https://...vercel.app` domain with a free SSL certificate.

### Adding Your Custom Domain (e.g. `yourbrand.com`)
1. In your Vercel/Netlify project settings, go to **Domains**.
2. Type in your registered domain name (e.g., `mystore.com` or `mystore.com.bd`).
3. Add the two DNS records (A record and CNAME) provided by Vercel into your domain registrar (Namecheap, GoDaddy, BTCL, etc.).
4. Your custom domain will automatically activate with a secure padlock (HTTPS).

---

## 2. Set Up Centralized Cloud Database (Supabase)

Your website includes a high-speed local database (**IndexedDB**) that works out of the box without any setup. However, to synchronize customer orders from mobile phones to your computer in real-time, connect a free Supabase cloud database:

### A. Create Your Free Database
1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New Project**, choose a project name (e.g., `mystore-db`), enter a secure database password, and select a nearby region (e.g., *Singapore*).

### B. Run the Database Schema (1-Click Setup)
1. In your Supabase project dashboard, click on **SQL Editor** in the left sidebar.
2. Click **New Query**.
3. Open the file [`supabase-schema.sql`](supabase-schema.sql) in this repository, copy all its contents, and paste them into the Supabase SQL Editor.
4. Click **Run** (bottom right).
   - This creates all necessary tables (`products`, `variants`, `orders`, `order_items`, `stock_history`, `settings`) and configures secure security policies.

### C. Connect the Store to Supabase
1. In Supabase, go to **Project Settings** (gear icon) ➔ **API**.
2. Copy your **Project URL** and your **anon / public** API key.
3. Open your store's admin dashboard (`https://yourdomain.com/dashboard.html`).
4. Navigate to **Settings** ➔ scroll down to **🗄️ Database & Cloud Sync Engine**.
5. Click **☁️ Connect Supabase Cloud Database (Optional)**:
   - Paste your **Supabase Project URL**.
   - Paste your **Public Anon Key**.
   - Click **🔍 Test Connection** ➔ verify the green success message.
   - Click **Save & Connect**.
6. That's it! Your store is now fully linked to cloud PostgreSQL.

---

## 3. Change Your Admin Password

> [!IMPORTANT]
> The initial default password is **`admin1234`**. You must change this immediately before launching to the public.

1. Open `dashboard.html` in your browser.
2. Sign in with the default password: `admin1234`.
3. In the left sidebar, click **Settings**.
4. Scroll to **Change Dashboard Password**:
   - Enter current password: `admin1234`.
   - Enter your new secure password (minimum 6 characters).
   - Confirm your new password and click **Update password**.
5. Your password is now encrypted using salted SHA-256 and stored securely.

---

## 4. Set Your Business Details & WhatsApp

1. In the Dashboard sidebar, click **Settings**.
2. Under **Shop Details**:
   - **Shop Name**: Enter your official business name.
   - **WhatsApp Number**: Enter your real WhatsApp business number with international code (e.g., `+880 1712345678` or `01712345678`). When customers click *"Checkout with WhatsApp"*, their order receipt will be sent directly to this number.
   - **Currency Symbol**: Default is `৳` (Bangladeshi Taka). Change to `$`, `€`, `₹`, or `AED` if selling internationally.
   - **Checkout Delivery Note**: Customize delivery fee rates (e.g., *"Delivery charge: Dhaka ৳60, Outside Dhaka ৳120"*).
3. Under **Shop Logo**:
   - Upload your transparent PNG or SVG brand logo. It will automatically update in your navbar, mobile header, and PDF receipts.
4. Click **Save settings**.

---

## 5. Managing Products & Inventory

### Transitioning from Demo Showcase to Your Real Products
- The starter website comes with sample showcase products (e.g. Linen shirts, dresses, duffle bags) so you can preview all features immediately.
- **To clear all demo items in 1 click**:
  1. In the Dashboard sidebar, click **Settings**.
  2. Scroll down to **Data Management & Backups**.
  3. Click **🗑 Clear Demo Catalog**.
  4. Your store and database will now be completely clean and empty, ready for your real client products!
- **Note on Cloud Database**: When you run [`supabase-schema.sql`](supabase-schema.sql) in Supabase, Section 6 is commented out by default. This ensures your cloud database is created **100% clean with zero demo products**.

### Adding Your Real Products
1. In the Dashboard sidebar, click **Products** ➔ click **+ Add product**.
2. Enter the Product Title, Price, and optional Regular/Discount Price (the system automatically displays a dynamic **`-20% OFF`** badge).
3. Assign the product to a **Department** (*Men*, *Women*, *Home & Living*, or *Unisex*) and a **Category**.
4. **Variant Stock Matrix**:
   - Add size options (e.g., `M`, `L`, `XL`) and color options (e.g., `Black`, `Navy`, `Olive`).
   - Enter stock counts for each combination.
5. Upload product photos (supports multiple angles and image compression).
6. Click **Save Product**.

### Adjusting Inventory Quickly
- Click the stock pill on any product row in the table to open the **📦 Stock Adjustment** modal. You can add or subtract units with an audit reason (*Received stock*, *Damaged*, *Return*, or *Correction*).

---

## 6. Managing Orders & Deliveries

When a customer orders via the website, their order appears instantly in **Dashboard ➔ Orders**:

1. **Reviewing Customer Details**: Click on any order card to see customer name, mobile number, full shipping address, and line items.
2. **Order Status Workflow**:
   - `Pending`: Newly placed order awaiting your call or WhatsApp verification.
   - `Confirmed`: You called the customer and confirmed the order (stock is reserved).
   - `Shipped`: Parcel handed to the courier (Steadfast, Pathao, RedX, eCourier, etc.).
   - `Delivered`: Delivery completed and cash collected.
   - `Cancelled`: Customer changed their mind. **Stock is automatically returned to inventory!**
3. **Download PDF Receipt**:
   - Click **Download PDF Proof** on any order card to generate an official branded PDF receipt ready for packaging or thermal printing.

---

## 7. Search Orders & Customer Order Tracking

- Customers can track their packages on the storefront by clicking **🔍 Track Order** in the navbar or footer and typing their Order ID (e.g. `ORD-202609-001`).
- The customer sees an interactive milestone stepper: **Placed ➔ Confirmed ➔ Shipped ➔ Delivered**.
- If their delivery is delayed, a 1-click button connects them to your WhatsApp with their order details pre-filled.

---

## 8. Data Backups

Under **Dashboard ➔ Settings ➔ Data Management & Backups**:
- Click **⬇ Export JSON Backup** at any time to save an offline copy of all your products, categories, orders, and shop configurations to your computer.
- You can restore your entire store anytime by clicking **⬆ Import JSON**.

---

*Ferry & Fable eCommerce Platform — Built for high performance, zero server costs, and instant ease of use.*
