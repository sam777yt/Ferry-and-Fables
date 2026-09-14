require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const vm = require("vm");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// ── Database Schemas ──────────────────────────────────────
const productSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  department: { type: String, default: "All" },
  category: { type: String, default: "" },
  subcategory: { type: String, default: "" },
  price: { type: Number, required: true },
  oldPrice: { type: Number, default: null },
  image: { type: String, default: "" },
  extraImages: { type: [String], default: [] },
  sizes: { type: [String], default: [] },
  colors: { type: [String], default: [] },
  description: { type: String, default: "" },
  badge: { type: String, default: "" },
  stock: { type: String, default: "in_stock" },
  stockCount: { type: Number, default: 20 },
  variantStock: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  date: { type: String, default: () => new Date().toISOString() },
  customer: {
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" }
  },
  payment: { type: String, default: "Cash on Delivery" },
  paymentStatus: { type: String, default: "pending" },
  items: { type: Array, default: [] },
  total: { type: Number, default: 0 },
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

const settingSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "main" },
  data: { type: Object, default: {} },
  updatedAt: { type: Date, default: Date.now }
});

const Product = mongoose.model("Product", productSchema);
const Order = mongoose.model("Order", orderSchema);
const Setting = mongoose.model("Setting", settingSchema);


// ── REST API Endpoints ────────────────────────────────────

// Products: List all
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find({}).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch products: " + err.message });
  }
});

// Products: Get single
app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await Product.findOne({ id: req.params.id });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Products: Create new product
app.post("/api/products", async (req, res) => {
  try {
    const data = req.body;
    if (!data.id) {
      data.id = "p_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    }
    const newProduct = new Product(data);
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(400).json({ error: "Failed to create product: " + err.message });
  }
});

// Products: Update product
app.put("/api/products/:id", async (req, res) => {
  try {
    const updated = await Product.findOneAndUpdate(
      { id: req.params.id },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: "Failed to update product: " + err.message });
  }
});

// Products: Bulk Sync
app.post("/api/products/sync", async (req, res) => {
  try {
    const products = Array.isArray(req.body) ? req.body : req.body.products;
    if (!Array.isArray(products)) {
      return res.status(400).json({ error: "Expected an array of products" });
    }
    // Update or insert each product
    for (const p of products) {
      if (p.id) {
        await Product.findOneAndUpdate({ id: p.id }, { $set: p }, { upsert: true });
      }
    }
    res.json({ message: "Products synced successfully", count: products.length });
  } catch (err) {
    res.status(500).json({ error: "Sync failed: " + err.message });
  }
});

// Products: Delete product
app.delete("/api/products/:id", async (req, res) => {
  try {
    const result = await Product.findOneAndDelete({ id: req.params.id });
    if (!result) return res.status(404).json({ error: "Product not found" });
    res.json({ message: "Product deleted successfully", id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete product: " + err.message });
  }
});

// Orders: List all
app.get("/api/orders", async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders: " + err.message });
  }
});

// Orders: Create new order (Direct Web Order)
app.post("/api/orders", async (req, res) => {
  try {
    const data = req.body;
    if (!data.id) {
      data.id = "ORD-" + Date.now().toString(36).toUpperCase();
    }
    const newOrder = new Order(data);
    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (err) {
    res.status(400).json({ error: "Failed to save order: " + err.message });
  }
});

// Orders: Update order status
app.put("/api/orders/:id", async (req, res) => {
  try {
    const updated = await Order.findOneAndUpdate(
      { id: req.params.id },
      { $set: req.body },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Order not found" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: "Failed to update order: " + err.message });
  }
});

// Orders: Delete order
app.delete("/api/orders/:id", async (req, res) => {
  try {
    const result = await Order.findOneAndDelete({ id: req.params.id });
    if (!result) return res.status(404).json({ error: "Order not found" });
    res.json({ message: "Order deleted", id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete order: " + err.message });
  }
});

// Settings: Get store settings
app.get("/api/settings", async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: "main" });
    res.json((setting && setting.data) || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settings: Save store settings
app.post("/api/settings", async (req, res) => {
  try {
    const updated = await Setting.findOneAndUpdate(
      { key: "main" },
      { data: req.body, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    res.json(updated.data);
  } catch (err) {
    res.status(400).json({ error: "Failed to save settings: " + err.message });
  }
});

// ── Static Frontend Serving ──────────────────────────────
app.use(express.static(path.join(__dirname)));

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ── Server Start & MongoDB Connect ────────────────────────
async function startServer() {
  try {
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000
    });
    console.log("✅ Connected to MongoDB Atlas successfully!");

    app.listen(PORT, () => {
      console.log(`\n🚀 Server running at: http://localhost:${PORT}`);
      console.log(`🛍️ Storefront:      http://localhost:${PORT}/`);
      console.log(`📊 Dashboard:       http://localhost:${PORT}/dashboard.html\n`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
}

startServer();
