-- ============================================================
-- FERRY & FABLE — PRODUCTION SECURE SUPABASE PERMISSIONS & RLS
-- ============================================================
-- STEP 2 COMMAND:
-- Run this one-line command first (replace 'admin@ferryandfable.com' with your actual Supabase auth user email):
-- update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb where email = 'admin@ferryandfable.com';
-- ============================================================

-- 1. ADMIN CHECK FUNCTION
-- Reads the secure app_metadata.role from the user's validated JWT.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false); $$;

-- 2. ENABLE ROW LEVEL SECURITY ON ALL TABLES
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stock_history enable row level security;

-- 3. DROP INSECURE & LEGACY POLICIES
drop policy if exists "Allow manage products" on public.products;
drop policy if exists "Public can read visible products" on public.products;
drop policy if exists "Admins manage products" on public.products;

drop policy if exists "Allow manage variants" on public.product_variants;
drop policy if exists "Public can read variants" on public.product_variants;
drop policy if exists "Admins manage variants" on public.product_variants;

drop policy if exists "Allow manage settings" on public.settings;
drop policy if exists "Public read storefront settings" on public.settings;
drop policy if exists "Admins manage settings" on public.settings;

drop policy if exists "Allow manage orders" on public.orders;
drop policy if exists "Allow read orders" on public.orders;
drop policy if exists "Allow update orders" on public.orders;
drop policy if exists "Admins read orders" on public.orders;
drop policy if exists "Admins update orders" on public.orders;
drop policy if exists "Admins delete orders" on public.orders;

drop policy if exists "Allow manage order items" on public.order_items;
drop policy if exists "Allow read order items" on public.order_items;
drop policy if exists "Admins read order items" on public.order_items;
drop policy if exists "Admins manage order items" on public.order_items;

drop policy if exists "Allow manage stock history" on public.stock_history;
drop policy if exists "Allow read stock history" on public.stock_history;
drop policy if exists "Admins read stock history" on public.stock_history;
drop policy if exists "Admins manage stock history" on public.stock_history;

-- 4. APPLY HARDENED PRODUCTION POLICIES

-- [PRODUCTS]
-- Public visitors can only view non-hidden products. Admins can view all (including hidden).
create policy "Public and admins read products" on public.products
  for select to anon, authenticated
  using (status <> 'hidden' or public.is_admin());

-- Only admins can insert, update, or delete products.
create policy "Admins insert products" on public.products
  for insert to authenticated with check (public.is_admin());

create policy "Admins update products" on public.products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Admins delete products" on public.products
  for delete to authenticated using (public.is_admin());

-- [PRODUCT VARIANTS]
-- Public can read variants to view sizes, colors, and in-stock status.
create policy "Public and admins read variants" on public.product_variants
  for select to anon, authenticated using (true);

-- Only admins can insert, update, or delete variants.
create policy "Admins insert variants" on public.product_variants
  for insert to authenticated with check (public.is_admin());

create policy "Admins update variants" on public.product_variants
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Admins delete variants" on public.product_variants
  for delete to authenticated using (public.is_admin());

-- [SETTINGS]
-- Public can read storefront brand info, WhatsApp number, and hero banner.
create policy "Public read settings" on public.settings
  for select to anon, authenticated using (true);

-- Only admins can change store settings.
create policy "Admins manage settings" on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- [ORDERS] — STRICT PRIVACY LOCKDOWN
-- Anonymous web visitors CANNOT query the orders table directly.
-- Customers place orders via the atomic place_order() RPC (security definer).
-- Customers track orders via the track_order() RPC (security definer) with token verification.
-- Only authenticated admins can read, update, or delete orders.
create policy "Admins read orders" on public.orders
  for select to authenticated using (public.is_admin());

create policy "Admins update orders" on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Admins delete orders" on public.orders
  for delete to authenticated using (public.is_admin());

-- [ORDER ITEMS] — STRICT PRIVACY LOCKDOWN
-- Only authenticated admins can read or manage order items directly.
create policy "Admins read order items" on public.order_items
  for select to authenticated using (public.is_admin());

create policy "Admins manage order items" on public.order_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- [STOCK HISTORY] — AUDIT LOG
-- Only authenticated admins can review the inventory audit trail.
create policy "Admins read stock history" on public.stock_history
  for select to authenticated using (public.is_admin());

-- 5. GRANTS & ROLES
grant usage on schema public to anon, authenticated;
grant select on public.products, public.product_variants, public.settings to anon, authenticated;
grant all on public.products, public.product_variants, public.settings, public.orders, public.order_items, public.stock_history to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- 6. RPC EXECUTION PERMISSIONS
grant execute on function public.place_order(text, text, text, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.track_order(text, text) to anon, authenticated;
grant execute on function public.adjust_stock(uuid, integer, text, text) to authenticated;

-- 7. ENABLE REALTIME SYNC
-- Ensures storefront and dashboard receive live instant push notifications
alter table public.products replica identity full;
alter table public.product_variants replica identity full;
alter table public.orders replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.products;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.product_variants;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.orders;
  exception when duplicate_object then null;
  end;
end $$;
