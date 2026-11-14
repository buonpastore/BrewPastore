-- Utilità «Conta bottiglie»: quante bottiglie vuote ha ognuno dei soci per la prossima cotta.
create table if not exists public.bottle_stock (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  b33        int not null default 0,
  b66        int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.bottle_stock enable row level security;
drop policy if exists "bottle_stock_read" on public.bottle_stock;
create policy "bottle_stock_read" on public.bottle_stock for select to authenticated using (true);
drop policy if exists "bottle_stock_write_own" on public.bottle_stock;
create policy "bottle_stock_write_own" on public.bottle_stock for all to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

notify pgrst, 'reload schema';
