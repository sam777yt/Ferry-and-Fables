/* ============================================================
   PRODUCT CATALOG & DEFAULT DATA
   ============================================================ */

const DEFAULT_DEPARTMENTS = [
  { id: "dept_all", name: "All items", slug: "all" },
  { id: "dept_men", name: "Men", slug: "Men" },
  { id: "dept_women", name: "Women", slug: "Women" },
  { id: "dept_home", name: "Home & Living", slug: "Home & Living" }
];

const DEFAULT_CATEGORIES = [
  {
    id: "cat_men_fashion",
    name: "Men's Fashion",
    department: "Men",
    subcategories: ["Shirts", "T-Shirts", "Pants", "Jackets", "Shoes"]
  },
  {
    id: "cat_women_fashion",
    name: "Women's Fashion",
    department: "Women",
    subcategories: ["Dresses", "Tops", "Pants", "Scarves", "Bags"]
  },
  {
    id: "cat_bags",
    name: "Bags & Wallets",
    department: "All",
    subcategories: ["Totes", "Backpacks", "Wallets", "Travel Bags"]
  },
  {
    id: "cat_home",
    name: "Home & Living",
    department: "Home & Living",
    subcategories: ["Coffee & Tea", "Desk & Decor", "Bedding", "Storage"]
  },
  {
    id: "cat_electronics",
    name: "Electronics",
    department: "All",
    subcategories: ["Audio", "Power", "Lighting", "Accessories"]
  }
];

// Empty starter catalog — ready for real products added via Dashboard
const PRODUCTS = [];
