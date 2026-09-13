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


const PRODUCTS = [
  {
    id: "p1",
    name: "Men's Relaxed Linen Shirt",
    department: "Men",
    category: "Men's Fashion",
    subcategory: "Shirts",
    price: 1350,
    oldPrice: 1750,
    image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&q=80",
    extraImages: [
      "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=800&q=80",
      "https://images.unsplash.com/photo-1620012253295-c15cc3e65df4?w=800&q=80",
      "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&q=80"
    ],
    tag: "Best seller",
    stock: "in_stock",
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: ["White", "Olive", "Navy", "Beige"],
    description: "Breathable pure linen-cotton blend shirt with regular fit and mother-of-pearl buttons. Perfect for warm climates and relaxed workdays."
  },
  {
    id: "p2",
    name: "Women's Flowy Linen Midi Dress",
    department: "Women",
    category: "Women's Fashion",
    subcategory: "Dresses",
    price: 2190,
    oldPrice: 2650,
    image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800&q=80",
    extraImages: [
      "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=800&q=80",
      "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=800&q=80",
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&q=80"
    ],
    tag: "New",
    stock: "in_stock",
    sizes: ["XS", "S", "M", "L", "XL"],
    colors: ["Sage Green", "Terracotta", "Pure White", "Black"],
    description: "Handcrafted tier midi dress made with washed European linen. Features hidden side pockets, square neckline, and a flattering waist tie."
  },

  {
    id: "p3",
    name: "Men's Classic Oxford Shirt",
    department: "Men",
    category: "Men's Fashion",
    subcategory: "Shirts",
    price: 1450,
    oldPrice: 1900,
    image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&q=80",
    extraImages: [
      "https://images.unsplash.com/photo-1603252109303-2751441dd157?w=800&q=80"
    ],
    tag: "Out of Stock Example",
    stock: "out_of_stock",
    sizes: ["M", "L", "XL"],
    colors: ["Sky Blue", "White", "Navy"],
    description: "Tailored 100% combed cotton Oxford cloth button-down. Pre-washed for a soft vintage feel that wears in, not out."
  },
  {
    id: "p4",
    name: "Women's Oversized Cotton Poplin Shirt",
    department: "Women",
    category: "Women's Fashion",
    subcategory: "Tops",
    price: 1280,
    oldPrice: 1550,
    image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800&q=80",
    extraImages: [
      "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=800&q=80"
    ],
    tag: "Trending",
    stock: "in_stock",
    sizes: ["Free Size", "S", "M", "L"],
    colors: ["Striped Blue", "Crisp White", "Butter Yellow"],
    description: "Relaxed drop-shoulder silhouette in crisp organic poplin. Wear buttoned up with trousers or open over a tank."
  },
  {
    id: "p5",
    name: "Everyday Canvas Tote Bag",
    department: "All",
    category: "Bags & Wallets",
    subcategory: "Totes",
    price: 890,
    oldPrice: 1200,
    image: "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=800&q=80",
    extraImages: [
      "https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&q=80"
    ],
    tag: "Best seller",
    stock: "in_stock",
    sizes: ["One Size"],
    colors: ["Natural Ecru", "Olive", "Black"],
    description: "Heavyweight 16oz cotton canvas tote with reinforced box-stitched handles. Easily fits a 15-inch laptop, books, and daily grocery runs."
  },
  {
    id: "p6",
    name: "Men's Chino Trousers",
    department: "Men",
    category: "Men's Fashion",
    subcategory: "Pants",
    price: 1690,
    oldPrice: 2100,
    image: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800&q=80",
    extraImages: [
      "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&q=80"
    ],
    tag: "Essential",
    stock: "in_stock",
    sizes: ["30", "32", "34", "36"],
    colors: ["Khaki", "Charcoal Grey", "Navy Blue"],
    description: "Slightly tapered stretch-cotton twill chinos. Soft enzyme washed for immediate comfort without breaking in."
  },
  {
    id: "p7",
    name: "Women's Wide Leg Linen Pants",
    department: "Women",
    category: "Women's Fashion",
    subcategory: "Pants",
    price: 1590,
    image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&q=80",
    extraImages: [
      "https://images.unsplash.com/photo-1551803091-e20673f15770?w=800&q=80"
    ],
    stock: "in_stock",
    sizes: ["S", "M", "L", "XL"],
    colors: ["Sand Beige", "White", "Navy"],
    description: "High-waisted silhouette with elasticated back waist and pleated front. Made from 100% natural pre-shrunk linen."
  },
  {
    id: "p8",
    name: "Ceramic Pour-Over Coffee Set",
    department: "Home & Living",
    category: "Home & Living",
    subcategory: "Coffee & Tea",
    price: 1450,
    image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80",
    tag: "Crafted",
    stock: "in_stock",
    sizes: ["Standard (350ml)"],
    colors: ["Matte Speckle", "Stone Grey"],
    description: "Hand-glazed stoneware dripper and matching mug set designed for slow, mindful morning brews."
  },
  {
    id: "p9",
    name: "Wireless ANC Earbuds Pro",
    department: "All",
    category: "Electronics",
    subcategory: "Audio",
    price: 2350,
    oldPrice: 2900,
    image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&q=80",
    tag: "-19%",
    stock: "in_stock",
    sizes: ["One Size"],
    colors: ["Matte Black", "Ivory White"],
    description: "Active noise cancellation, transparency mode, 28-hour total playback with USB-C wireless charging case."
  },
  {
    id: "p10",
    name: "Full-Grain Leather Card Wallet",
    department: "All",
    category: "Bags & Wallets",
    subcategory: "Wallets",
    price: 780,
    image: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&q=80",
    stock: "in_stock",
    sizes: ["Slim"],
    colors: ["Whiskey Tan", "Espresso Brown", "Black"],
    description: "Vegetable-tanned full grain leather with hand-burnished edges. Six card slots plus central note pocket."
  },
  {
    id: "p11",
    name: "Women's Soft Wool Blend Scarf",
    department: "Women",
    category: "Women's Fashion",
    subcategory: "Scarves",
    price: 590,
    image: "https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?w=800&q=80",
    stock: "out_of_stock",
    sizes: ["One Size (200x70cm)"],
    colors: ["Oatmeal", "Burgundy", "Forest Green"],
    description: "Generous length wrap scarf woven with extra fine merino wool blend. Ultra soft against sensitive skin."
  },
  {
    id: "p12",
    name: "Minimalist Smart Desk Lamp",
    department: "Home & Living",
    category: "Electronics",
    subcategory: "Lighting",
    price: 1340,
    image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=80",
    stock: "in_stock",
    sizes: ["Compact"],
    colors: ["Matte White", "Space Grey"],
    description: "Touch-controlled color temperature from warm 2700K to daylight 5500K. Built-in USB output to charge your phone."
  }

];
