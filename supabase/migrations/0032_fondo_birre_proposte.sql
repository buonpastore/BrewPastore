-- Fondo birre: le bottiglie in comune dell'attività (non di un socio)
create table if not exists public.common_bottles (
  batch_id   uuid primary key references public.batches(id) on delete cascade,
  bottles    int  not null default 0 check (bottles >= 0),
  updated_at timestamptz not null default now()
);
alter table public.common_bottles enable row level security;
drop policy if exists "common_read" on public.common_bottles;
create policy "common_read" on public.common_bottles for select to authenticated using (true);
drop policy if exists "common_write" on public.common_bottles;
create policy "common_write" on public.common_bottles for all to authenticated using (true) with check (true);

-- Righe delle vendite: bottiglie prese dal fondo birre
alter table public.sale_items add column if not exists from_fund boolean not null default false;

-- Proposte di vendita: «me le hanno chieste», ancora da vendere
create table if not exists public.sale_proposals (
  id           uuid primary key default gen_random_uuid(),
  buyer        text not null check (length(trim(buyer)) > 0),
  notes        text,
  requested_by uuid default auth.uid() references public.profiles(id) on delete set null,
  status       text not null default 'aperta' check (status in ('aperta', 'venduta', 'annullata')),
  sale_id      uuid references public.sales(id) on delete set null,
  created_at   timestamptz not null default now()
);
create table if not exists public.sale_proposal_items (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.sale_proposals(id) on delete cascade,
  batch_id     uuid references public.batches(id) on delete set null,
  bottles      int  not null check (bottles > 0),
  unit_price   numeric(10,2) not null default 0 check (unit_price >= 0),
  giver_id     uuid references public.profiles(id) on delete set null,   -- chi le dà
  from_fund    boolean not null default false,                           -- oppure dal fondo birre
  giver_status text not null default 'attesa' check (giver_status in ('ok', 'attesa', 'no')),
  created_at   timestamptz not null default now()
);
create index if not exists sale_proposal_items_idx on public.sale_proposal_items (proposal_id);

alter table public.sale_proposals enable row level security;
drop policy if exists "prop_read" on public.sale_proposals;
create policy "prop_read" on public.sale_proposals for select to authenticated using (true);
drop policy if exists "prop_insert" on public.sale_proposals;
create policy "prop_insert" on public.sale_proposals for insert to authenticated with check (true);
drop policy if exists "prop_update" on public.sale_proposals;
create policy "prop_update" on public.sale_proposals for update to authenticated using (true) with check (true);
drop policy if exists "prop_delete" on public.sale_proposals;
create policy "prop_delete" on public.sale_proposals for delete to authenticated using (requested_by = auth.uid() or public.is_admin());

alter table public.sale_proposal_items enable row level security;
drop policy if exists "propi_read" on public.sale_proposal_items;
create policy "propi_read" on public.sale_proposal_items for select to authenticated using (true);
drop policy if exists "propi_write" on public.sale_proposal_items;
create policy "propi_write" on public.sale_proposal_items for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
