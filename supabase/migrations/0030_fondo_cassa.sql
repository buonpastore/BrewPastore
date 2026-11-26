-- Fondo cassa: i soldi in comune. Ogni movimento è un'entrata (+) o un'uscita (−),
-- collegata se serve a una vendita, a un acquisto o a una spesa condivisa.
create table if not exists public.cash_movements (
  id          uuid primary key default gen_random_uuid(),
  amount      numeric(10,2) not null check (amount <> 0),          -- + entra nel fondo, − esce dal fondo
  kind        text not null default 'altro' check (kind in ('vendita', 'acquisto', 'spesa', 'versamento', 'prelievo', 'altro')),
  description text,
  moved_on    date not null default current_date,
  sale_id     uuid references public.sales(id) on delete cascade,
  purchase_id uuid references public.purchases(id) on delete cascade,
  expense_id  uuid references public.expenses(id) on delete cascade,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists cash_movements_date_idx on public.cash_movements (moved_on desc, created_at desc);

alter table public.cash_movements enable row level security;
drop policy if exists "cash_read" on public.cash_movements;
create policy "cash_read" on public.cash_movements for select to authenticated using (true);
drop policy if exists "cash_insert" on public.cash_movements;
create policy "cash_insert" on public.cash_movements for insert to authenticated with check (true);
drop policy if exists "cash_change" on public.cash_movements;
create policy "cash_change" on public.cash_movements for update to authenticated
  using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());
drop policy if exists "cash_delete" on public.cash_movements;
create policy "cash_delete" on public.cash_movements for delete to authenticated
  using (created_by = auth.uid() or public.is_admin()
    or exists (select 1 from public.sales s where s.id = sale_id and (s.created_by = auth.uid() or s.seller_id = auth.uid())));

-- Vendite: i soldi possono andare nel fondo cassa (ora è la scelta di partenza)
alter table public.sales drop constraint if exists sales_split_check;
alter table public.sales add constraint sales_split_check check (split in ('soci', 'venditore', 'cassa'));
alter table public.sales alter column split set default 'cassa';

-- Righe della vendita: chi dà quelle bottiglie (si scalano dalla sua cantina)
alter table public.sale_items add column if not exists giver_id uuid references public.profiles(id) on delete set null;

notify pgrst, 'reload schema';
