-- Economia → Ricavi → Vendite: a chi vendiamo le bottiglie, quante, a che prezzo e come si dividono i soldi
create table if not exists public.sales (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  buyer       text not null check (length(trim(buyer)) > 0),
  sold_on     date not null default current_date,
  batch_id    uuid references public.batches(id) on delete set null,
  bottles     int  not null check (bottles > 0),
  unit_price  numeric(10,2) not null default 0 check (unit_price >= 0),
  -- 'soci' = l'incasso si divide in parti uguali tra i soci; 'venditore' = se lo tiene chi ha venduto
  split       text not null default 'soci' check (split in ('soci', 'venditore')),
  notes       text,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists sales_created_idx on public.sales (created_at desc);

alter table public.sales enable row level security;
drop policy if exists "sales_read" on public.sales;
create policy "sales_read" on public.sales for select to authenticated using (true);
drop policy if exists "sales_insert" on public.sales;
create policy "sales_insert" on public.sales for insert to authenticated with check (true);
drop policy if exists "sales_update" on public.sales;
create policy "sales_update" on public.sales for update to authenticated
  using (created_by = auth.uid() or seller_id = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or seller_id = auth.uid() or public.is_admin());
drop policy if exists "sales_delete" on public.sales;
create policy "sales_delete" on public.sales for delete to authenticated
  using (created_by = auth.uid() or seller_id = auth.uid() or public.is_admin());

notify pgrst, 'reload schema';
