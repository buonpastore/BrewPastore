-- Cantina: quante bottiglie di ogni batch ha ciascun socio
create table if not exists public.cellar_bottles (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  batch_id   uuid not null references public.batches(id) on delete cascade,
  bottles    int  not null default 0 check (bottles >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, batch_id)
);

alter table public.cellar_bottles enable row level security;
drop policy if exists "cellar_read" on public.cellar_bottles;
create policy "cellar_read" on public.cellar_bottles for select to authenticated using (true);
drop policy if exists "cellar_write" on public.cellar_bottles;
-- ognuno aggiorna la sua cantina (l'admin anche quelle degli altri)
create policy "cellar_write" on public.cellar_bottles for all to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

notify pgrst, 'reload schema';
