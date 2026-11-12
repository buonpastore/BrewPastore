-- =====================================================================
-- BREWPASTORE - spese condivise e rimborsi tra i soci
-- Qui scrivono TUTTI gli utenti (ognuno solo le proprie spese/rimborsi).
-- =====================================================================

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  paid_by      uuid not null references public.profiles(id) default auth.uid(),
  description  text not null,
  amount       numeric(10,2) not null check (amount > 0),
  expense_date date not null default current_date,
  receipt_path text,                       -- file nello storage (bucket documents, cartella expenses/)
  purchase_id  uuid references public.purchases(id) on delete set null,  -- collegata a un acquisto materie prime
  batch_id     uuid references public.batches(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now()
);

-- quota di ogni persona (incluso chi ha pagato)
create table public.expense_shares (
  id         uuid not null default gen_random_uuid() unique,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id    uuid not null references public.profiles(id),
  amount     numeric(10,2) not null check (amount >= 0),
  primary key (expense_id, user_id)
);

create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references public.profiles(id) default auth.uid(),
  to_user      uuid not null references public.profiles(id),
  amount       numeric(10,2) not null check (amount > 0),
  method       text not null check (method in ('bonifico','paypal','contanti','altro')),
  paid_on      date not null default current_date,
  expense_id   uuid references public.expenses(id) on delete set null,
  notes        text,
  confirmed    boolean not null default false,       -- il destinatario conferma di averli ricevuti
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  check (from_user <> to_user)
);

do $$
declare t text;
begin
  foreach t in array array['expenses','expense_shares','settlements'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

-- ---------- RLS -------------------------------------------------------
alter table public.expenses       enable row level security;
alter table public.expense_shares enable row level security;
alter table public.settlements    enable row level security;

create policy "expenses_read"   on public.expenses for select to authenticated using (true);
create policy "expenses_insert" on public.expenses for insert to authenticated with check (paid_by = auth.uid() or public.is_admin());
create policy "expenses_update" on public.expenses for update to authenticated using (paid_by = auth.uid() or public.is_admin()) with check (paid_by = auth.uid() or public.is_admin());
create policy "expenses_delete" on public.expenses for delete to authenticated using (paid_by = auth.uid() or public.is_admin());

create policy "shares_read"  on public.expense_shares for select to authenticated using (true);
create policy "shares_write" on public.expense_shares for all to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and (e.paid_by = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and (e.paid_by = auth.uid() or public.is_admin())));

create policy "settle_read"   on public.settlements for select to authenticated using (true);
create policy "settle_insert" on public.settlements for insert to authenticated with check (from_user = auth.uid() or public.is_admin());
-- chi ha inviato può correggere; chi riceve può confermare
create policy "settle_update" on public.settlements for update to authenticated
  using (from_user = auth.uid() or to_user = auth.uid() or public.is_admin())
  with check (from_user = auth.uid() or to_user = auth.uid() or public.is_admin());
create policy "settle_delete" on public.settlements for delete to authenticated using ((from_user = auth.uid() and not confirmed) or public.is_admin());

-- tutti possono caricare scontrini nella propria cartella expenses/<uid>/
create policy "receipts_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = 'expenses'
              and (storage.foldername(name))[2] = auth.uid()::text);
create policy "receipts_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'expenses'
         and (storage.foldername(name))[2] = auth.uid()::text);

-- ---------- Saldi ----------------------------------------------------
-- saldo > 0  => la persona deve RICEVERE soldi; < 0 => deve DARE
create view public.member_balances with (security_invoker = true) as
select p.id as user_id, p.display_name,
  coalesce((select sum(e.amount) from public.expenses e where e.paid_by = p.id), 0)
  - coalesce((select sum(s.amount) from public.expense_shares s where s.user_id = p.id), 0)
  + coalesce((select sum(t.amount) from public.settlements t where t.from_user = p.id), 0)
  - coalesce((select sum(t.amount) from public.settlements t where t.to_user = p.id), 0) as balance
from public.profiles p;
