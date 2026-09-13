/* Run once from the browser console after configuring Supabase:
   migrateFfCatalog().then(console.log).catch(console.error)
*/
window.migrateFfCatalog = async function () {
  const client = window.requireFfSupabase();
  let products = [];
  if (window.FF_DB && typeof window.FF_DB.getProducts === "function") {
    products = await window.FF_DB.getProducts();
  } else if (typeof PRODUCTS !== "undefined") {
    products = PRODUCTS;
  }
  if (!products.length) return { products: 0, variants: 0 };
  const productRows = products.map(product => ({
    id: product.id, name: product.name, department: product.department || "All",
    category: product.category || "", subcategory: product.subcategory || "",
    price: Number(product.price) || 0, old_price: product.oldPrice == null ? null : Number(product.oldPrice),
    images: [product.image, ...(product.extraImages || [])].filter(Boolean),
    description: product.description || "", tag: product.tag || null,
    status: product.stock || "in_stock", track_stock: product.trackStock !== false,
    low_stock_threshold: product.lowStockThreshold ?? null
  }));
  const { error: productsError } = await client.from("products").upsert(productRows);
  if (productsError) throw productsError;

  const variantRows = [];
  products.forEach(product => {
    const sizes = product.sizes && product.sizes.length ? product.sizes : [""];
    const colors = product.colors && product.colors.length ? product.colors : [""];
    sizes.forEach(size => colors.forEach(color => {
      const isOut = product.stock === "out_of_stock";
      variantRows.push({ product_id: product.id, size, color, stock_quantity: isOut ? 0 : 20 });
    }));
  });
  const { error: variantsError } = await client.from("product_variants").upsert(variantRows, { onConflict: "product_id,size,color" });
  if (variantsError) throw variantsError;

  return { products: productRows.length, variants: variantRows.length };
};
