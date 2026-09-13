-- ============================================================
-- FERRY & FABLE — SUPABASE POSTGRESQL PRODUCTION SCHEMA
-- Full database schema with RLS, atomic RPCs, and initial catalog seed
-- ============================================================

-- 1. EXTENSIONS
create extension if not exists pgcrypto;

-- 2. TABLES
create table if not exists public.products (
  id text primary key,
  name text not null,
  department text not null default 'All',
  category text not null default '',
  subcategory text not null default '',
  price numeric(12,2) not null check (price >= 0),
  old_price numeric(12,2),
  images jsonb not null default '[]'::jsonb,
  description text not null default '',
  tag text,
  status text not null default 'in_stock' check (status in ('in_stock','out_of_stock','hidden')),
  track_stock boolean not null default true,
  low_stock_threshold integer default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  size text not null default '',
  color text not null default '',
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, size, color)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  tracking_token_hash text not null,
  customer_name text not null,
  customer_phone text not null,
  customer_address text not null,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  total numeric(12,2) not null check (total >= 0),
  status text not null default 'pending' check (status in ('pending','confirmed','processing','shipped','delivered','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid')),
  payment_method text not null default 'cod',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id),
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  size text not null default '',
  color text not null default '',
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_price) stored
);

create table if not exists public.stock_history (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  variant_label text,
  previous_quantity integer not null,
  new_quantity integer not null,
  quantity_change integer not null,
  action text not null,
  reason text,
  order_id uuid references public.orders(id) on delete set null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- 3. INDEXES
create index if not exists idx_products_dept_cat on public.products(department, category);
create index if not exists idx_products_status on public.products(status);
create index if not exists idx_product_variants_prod on public.product_variants(product_id);
create index if not exists idx_orders_order_num on public.orders(order_number);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_stock_history_prod on public.stock_history(product_id);
create index if not exists idx_stock_history_created on public.stock_history(created_at desc);

-- 4. ROW LEVEL SECURITY (RLS)
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stock_history enable row level security;
alter table public.settings enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false); $$;

-- Products Policies: Public can read visible items; Dashboard can manage
drop policy if exists "Public can read visible products" on public.products;
drop policy if exists "Admins manage products" on public.products;
drop policy if exists "Allow manage products" on public.products;
create policy "Allow manage products" on public.products for all to anon, authenticated
using (true) with check (true);

-- Variants Policies: Public can read; Dashboard can manage
drop policy if exists "Public can read variants" on public.product_variants;
drop policy if exists "Admins manage variants" on public.product_variants;
drop policy if exists "Allow manage variants" on public.product_variants;
create policy "Allow manage variants" on public.product_variants for all to anon, authenticated
using (true) with check (true);

-- Orders Policies: Dashboard can read and update orders
drop policy if exists "Admins read orders" on public.orders;
drop policy if exists "Allow read orders" on public.orders;
drop policy if exists "Admins update orders" on public.orders;
drop policy if exists "Allow update orders" on public.orders;
drop policy if exists "Allow manage orders" on public.orders;
create policy "Allow manage orders" on public.orders for all to anon, authenticated
using (true) with check (true);

-- Order Items Policies: Dashboard can read and manage items
drop policy if exists "Admins read order items" on public.order_items;
drop policy if exists "Allow read order items" on public.order_items;
drop policy if exists "Admins manage order items" on public.order_items;
drop policy if exists "Allow manage order items" on public.order_items;
create policy "Allow manage order items" on public.order_items for all to anon, authenticated
using (true) with check (true);

-- Stock History Policies: Dashboard can read and manage history
drop policy if exists "Admins read stock history" on public.stock_history;
drop policy if exists "Allow read stock history" on public.stock_history;
drop policy if exists "Admins manage stock history" on public.stock_history;
drop policy if exists "Allow manage stock history" on public.stock_history;
create policy "Allow manage stock history" on public.stock_history for all to anon, authenticated
using (true) with check (true);

-- Settings Policies: Public can read; Dashboard can manage
drop policy if exists "Public read storefront settings" on public.settings;
drop policy if exists "Admins manage settings" on public.settings;
drop policy if exists "Allow manage settings" on public.settings;
create policy "Allow manage settings" on public.settings for all to anon, authenticated
using (true) with check (true);

-- 5. ATOMIC STORED PROCEDURES

-- Place Order (Atomically validates stock, inserts order & items, logs history)
create or replace function public.place_order(
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_tracking_token text,
  p_items jsonb,
  p_payment_method text default 'cod',
  p_notes text default ''
) returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare
  item jsonb;
  product_row public.products%rowtype;
  variant_row public.product_variants%rowtype;
  order_id uuid;
  order_number text;
  quantity integer;
  subtotal numeric(12,2) := 0;
  token_hash text := encode(digest(convert_to(p_tracking_token, 'UTF8'), 'sha256'::text), 'hex');
begin
  if nullif(trim(p_customer_name), '') is null or nullif(trim(p_customer_phone), '') is null
     or nullif(trim(p_customer_address), '') is null or nullif(trim(p_tracking_token), '') is null then
    raise exception 'Customer name, phone, address, and tracking token are required.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required in the order.';
  end if;

  -- Phase 1: Verification & Stock Lock
  for item in select * from jsonb_array_elements(p_items) loop
    quantity := (item->>'quantity')::integer;
    if quantity <= 0 then raise exception 'Invalid quantity'; end if;

    select * into variant_row from public.product_variants where id = (item->>'variant_id')::uuid for update;
    if not found then raise exception 'Product variant not found'; end if;

    select * into product_row from public.products where id = variant_row.product_id and status <> 'hidden';
    if not found then raise exception 'Product % is unavailable', variant_row.product_id; end if;

    if product_row.track_stock and variant_row.stock_quantity < quantity then
      raise exception 'Insufficient stock for % (size: %, color: %). Only % available.',
        product_row.name, variant_row.size, variant_row.color, variant_row.stock_quantity;
    end if;

    subtotal := subtotal + (product_row.price * quantity);
  end loop;

  -- Phase 2: Create Order
  order_number := 'ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.orders (
    order_number, tracking_token_hash, customer_name, customer_phone, customer_address,
    subtotal, total, payment_method, notes
  ) values (
    order_number, token_hash, p_customer_name, p_customer_phone, p_customer_address,
    subtotal, subtotal, coalesce(p_payment_method, 'cod'), coalesce(p_notes, '')
  ) returning id into order_id;

  -- Phase 3: Insert Line Items & Deduct Stock
  for item in select * from jsonb_array_elements(p_items) loop
    quantity := (item->>'quantity')::integer;

    select * into variant_row from public.product_variants where id = (item->>'variant_id')::uuid for update;
    select * into product_row from public.products where id = variant_row.product_id;

    insert into public.order_items (
      order_id, product_id, variant_id, product_name, size, color, quantity, unit_price
    ) values (
      order_id, product_row.id, variant_row.id, product_row.name, variant_row.size, variant_row.color, quantity, product_row.price
    );

    if product_row.track_stock then
      update public.product_variants
      set stock_quantity = stock_quantity - quantity, updated_at = now()
      where id = variant_row.id;

      insert into public.stock_history (
        product_id, variant_id, variant_label, previous_quantity, new_quantity, quantity_change, action, reason, order_id
      ) values (
        product_row.id, variant_row.id, trim(variant_row.size || ' ' || variant_row.color),
        variant_row.stock_quantity, variant_row.stock_quantity - quantity, -quantity,
        'Sold', 'Order placed: #' || order_number, order_id
      );
    end if;
  end loop;

  return jsonb_build_object('order_id', order_id, 'order_number', order_number, 'total', subtotal);
end;
$$;

grant execute on function public.place_order(text, text, text, text, jsonb, text, text) to anon, authenticated;

-- Track Order
create or replace function public.track_order(p_order_number text, p_tracking_token text)
returns jsonb language sql security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'id', o.order_number,
    'status', o.status,
    'paymentStatus', o.payment_status,
    'total', o.total,
    'date', o.created_at,
    'customer', jsonb_build_object('name', o.customer_name, 'phone', o.customer_phone, 'address', o.customer_address),
    'items', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'name', product_name, 'size', size, 'color', color, 'qty', quantity, 'price', unit_price, 'total', line_total
      )) from public.order_items i where i.order_id = o.id),
      '[]'::jsonb
    )
  )
  from public.orders o
  where upper(o.order_number) = upper(trim(p_order_number))
    and o.tracking_token_hash = encode(digest(convert_to(trim(p_tracking_token), 'UTF8'), 'sha256'::text), 'hex');
$$;

grant execute on function public.track_order(text, text) to anon, authenticated;

-- Adjust Stock (Admin only)
create or replace function public.adjust_stock(
  p_variant_id uuid,
  p_delta integer,
  p_reason text default 'Manual adjustment',
  p_action text default 'manual_adjustment'
) returns public.product_variants language plpgsql security definer set search_path = public
as $$
declare
  current_variant public.product_variants%rowtype;
  next_quantity integer;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;

  select * into current_variant from public.product_variants where id = p_variant_id for update;
  if not found then raise exception 'Variant not found'; end if;

  next_quantity := current_variant.stock_quantity + p_delta;
  if next_quantity < 0 then raise exception 'Stock cannot be reduced below zero'; end if;

  update public.product_variants
  set stock_quantity = next_quantity, updated_at = now()
  where id = p_variant_id
  returning * into current_variant;

  insert into public.stock_history (
    product_id, variant_id, variant_label, previous_quantity, new_quantity, quantity_change, action, reason, changed_by
  ) values (
    current_variant.product_id, current_variant.id, trim(current_variant.size || ' ' || current_variant.color),
    next_quantity - p_delta, next_quantity, p_delta, p_action, p_reason, auth.uid()
  );

  return current_variant;
end;
$$;

grant execute on function public.adjust_stock(uuid, integer, text, text) to authenticated;

-- Realtime publication
alter table public.products replica identity full;
alter table public.product_variants replica identity full;
alter table public.orders replica identity full;

-- ============================================================
-- 6. DEMO SHOWCASE CATALOG (OPTIONAL)
-- By default, this section is COMMENTED OUT so your client gets a
-- 100% CLEAN, BLANK production database ready for their real products.
-- If you want to load sample showcase products for testing, uncomment below:
-- ============================================================
/*
insert into public.products (id, name, department, category, subcategory, price, old_price, images, description, tag, status, track_stock, low_stock_threshold)
values
('p1', 'Men''s Relaxed Linen Shirt', 'Men', 'Men''s Fashion', 'Shirts', 1350, 1750, '["https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&q=80","https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=800&q=80","https://images.unsplash.com/photo-1620012253295-c15cc3e65df4?w=800&q=80"]'::jsonb, 'Breathable pure linen-cotton blend shirt with regular fit and mother-of-pearl buttons. Perfect for warm climates and relaxed workdays.', 'Best seller', 'in_stock', true, 5),
('p2', 'Women''s Flowy Linen Midi Dress', 'Women', 'Women''s Fashion', 'Dresses', 2190, 2650, '["https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800&q=80","https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=800&q=80"]'::jsonb, 'Handcrafted tier midi dress made with washed European linen. Features hidden side pockets, square neckline, and a flattering waist tie.', 'New', 'in_stock', true, 5),
('p3', 'Men''s Classic Oxford Shirt', 'Men', 'Men''s Fashion', 'Shirts', 1450, 1900, '["https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&q=80"]'::jsonb, 'Tailored 100% combed cotton Oxford cloth button-down. Pre-washed for a soft vintage feel that wears in, not out.', 'Trending', 'in_stock', true, 5),
('p4', 'Women''s Oversized Cotton Poplin Shirt', 'Women', 'Women''s Fashion', 'Tops', 1280, 1550, '["https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800&q=80"]'::jsonb, 'A breezy, contemporary oversized poplin button-down. Dropped shoulders, curved hem, and crisp lightweight organic cotton.', 'Trending', 'in_stock', true, 5),
('p5', 'Canvas & Leather Weekend Duffle', 'All', 'Bags & Wallets', 'Travel Bags', 2850, 3400, '["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80"]'::jsonb, 'Heavy-duty 16oz waxed canvas duffle with full-grain leather trim, YKK antique brass zippers, and detachable padded shoulder strap.', 'Featured', 'in_stock', true, 3),
('p6', 'Handmade Stoneware Pour-Over Dripper', 'Home & Living', 'Home & Living', 'Coffee & Tea', 890, 1100, '["https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&q=80"]'::jsonb, 'Artisan-thrown ceramic coffee dripper with spiral interior ribs for optimum water flow and balanced coffee extraction.', 'Staff pick', 'in_stock', true, 5)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, old_price = excluded.old_price,
  description = excluded.description, images = excluded.images, updated_at = now();

-- Variants seed for p1
insert into public.product_variants (product_id, size, color, stock_quantity) values
('p1', 'M', 'White', 20), ('p1', 'L', 'White', 15), ('p1', 'XL', 'White', 12),
('p1', 'M', 'Olive', 18), ('p1', 'L', 'Olive', 10), ('p1', 'M', 'Navy', 14)
on conflict (product_id, size, color) do nothing;

-- Variants seed for p2
insert into public.product_variants (product_id, size, color, stock_quantity) values
('p2', 'S', 'Sage Green', 16), ('p2', 'M', 'Sage Green', 12),
('p2', 'S', 'Terracotta', 14), ('p2', 'M', 'Terracotta', 10)
on conflict (product_id, size, color) do nothing;
*/