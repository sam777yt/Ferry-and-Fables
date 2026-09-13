-- ============================================================
-- FERRY & FABLE — SUPABASE RLS PERMISSIONS FIX
-- Run this in your Supabase SQL Editor to allow the dashboard
-- to add, edit, delete products and manage orders.
-- ============================================================

-- Grant schema and table access to anon and authenticated roles
grant usage on schema public to anon, authenticated;
grant all on public.products to anon, authenticated;
grant all on public.product_variants to anon, authenticated;
grant all on public.settings to anon, authenticated;
grant all on public.orders to anon, authenticated;
grant all on public.order_items to anon, authenticated;
grant all on public.stock_history to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- 1. Products (Public read + Dashboard manage)
drop policy if exists "Public can read visible products" on public.products;
drop policy if exists "Admins manage products" on public.products;
drop policy if exists "Allow manage products" on public.products;
create policy "Allow manage products" on public.products for all to anon, authenticated using (true) with check (true);

-- 2. Variants (Public read + Dashboard manage)
drop policy if exists "Public can read variants" on public.product_variants;
drop policy if exists "Admins manage variants" on public.product_variants;
drop policy if exists "Allow manage variants" on public.product_variants;
create policy "Allow manage variants" on public.product_variants for all to anon, authenticated using (true) with check (true);

-- 3. Settings (Public read + Dashboard manage)
drop policy if exists "Public read storefront settings" on public.settings;
drop policy if exists "Admins manage settings" on public.settings;
drop policy if exists "Allow manage settings" on public.settings;
create policy "Allow manage settings" on public.settings for all to anon, authenticated using (true) with check (true);

-- 4. Orders (Dashboard read, insert, update, delete)
drop policy if exists "Admins read orders" on public.orders;
drop policy if exists "Allow read orders" on public.orders;
drop policy if exists "Admins update orders" on public.orders;
drop policy if exists "Allow update orders" on public.orders;
drop policy if exists "Allow manage orders" on public.orders;
create policy "Allow manage orders" on public.orders for all to anon, authenticated using (true) with check (true);

-- 5. Order Items (Dashboard read, insert, update, delete)
drop policy if exists "Admins read order items" on public.order_items;
drop policy if exists "Allow read order items" on public.order_items;
drop policy if exists "Admins manage order items" on public.order_items;
drop policy if exists "Allow manage order items" on public.order_items;
create policy "Allow manage order items" on public.order_items for all to anon, authenticated using (true) with check (true);

-- 6. Stock History (Audit logging & stock tracking)
drop policy if exists "Admins read stock history" on public.stock_history;
drop policy if exists "Allow read stock history" on public.stock_history;
drop policy if exists "Admins manage stock history" on public.stock_history;
drop policy if exists "Allow manage stock history" on public.stock_history;
create policy "Allow manage stock history" on public.stock_history for all to anon, authenticated using (true) with check (true);
