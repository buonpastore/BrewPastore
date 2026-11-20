-- Vendite con più birre: ogni vendita ha le sue righe (quale birra, quante bottiglie, a che prezzo)
alter table public.sales add column if not exists amount numeric(10,2);   -- totale della vendita (somma delle righe)

create table if not exists public.sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references public.sales(id) on delete cascade,
  batch_id    uuid references public.batches(id) on delete set null,
  bottles     int  not null check (bottles > 0),
  unit_price  numeric(10,2) not null default 0 check (unit_price >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);

alter table public.sale_items enable row level security;
drop policy if exists "sale_items_read" on public.sale_items;
create policy "sale_items_read" on public.sale_items for select to authenticated using (true);
drop policy if exists "sale_items_write" on public.sale_items;
-- le righe le gestisce chi può gestire la vendita (chi l'ha inserita, chi ha venduto, l'admin)
create policy "sale_items_write" on public.sale_items for all to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id and (s.created_by = auth.uid() or s.seller_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.sales s where s.id = sale_id and (s.created_by = auth.uid() or s.seller_id = auth.uid() or public.is_admin())));

notify pgrst, 'reload schema';
