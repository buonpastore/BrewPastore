-- =====================================================================
-- BREWPASTORE - preventivi per l'ampliamento dell'impianto (con versioni)
-- =====================================================================

create table public.equipment_projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- es. "Passaggio a impianto 50 L"
  description text,
  budget      numeric(10,2),
  status      text not null default 'in_valutazione'
              check (status in ('in_valutazione','approvato','acquistato','scartato')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- un preventivo = un fornitore; ogni nuova offerta dello stesso fornitore è una nuova versione
create table public.equipment_quotes (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.equipment_projects(id) on delete cascade,
  supplier     text not null,
  version      int not null default 1,
  quote_date   date default current_date,
  valid_until  date,
  shipping_cost numeric(10,2) not null default 0,
  prices_include_vat boolean not null default true,
  status       text not null default 'ricevuto'
               check (status in ('ricevuto','in_trattativa','scelto','scartato','superato')),
  notes        text,
  source_path  text,                          -- file originale (Excel/PDF) nello storage
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (project_id, supplier, version)
);

create table public.equipment_quote_items (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references public.equipment_quotes(id) on delete cascade,
  sort_order   int not null default 0,
  code         text,                          -- codice articolo
  description  text not null,
  category     text,                          -- es. pentola, fermentatore, pompa, controllo...
  quantity     numeric(10,2) not null default 1,
  unit_price   numeric(12,2) not null default 0,
  discount_pct numeric(5,2) not null default 0,
  vat_pct      numeric(5,2) not null default 22,
  notes        text
);

create trigger equipment_projects_touch before update on public.equipment_projects for each row execute function public.touch_updated_at();
create trigger equipment_quotes_touch   before update on public.equipment_quotes   for each row execute function public.touch_updated_at();

-- totali per preventivo
create view public.equipment_quote_totals with (security_invoker = true) as
select q.id as quote_id, q.project_id, q.supplier, q.version, q.status,
       count(i.id) as items_count,
       coalesce(sum(i.quantity * i.unit_price * (1 - i.discount_pct / 100)), 0) as goods,
       coalesce(sum(case when q.prices_include_vat then i.quantity * i.unit_price * (1 - i.discount_pct / 100)
                         else i.quantity * i.unit_price * (1 - i.discount_pct / 100) * (1 + i.vat_pct / 100) end), 0)
         + q.shipping_cost as total_with_vat
from public.equipment_quotes q
left join public.equipment_quote_items i on i.quote_id = q.id
group by q.id;

do $$
declare t text;
begin
  foreach t in array array['equipment_projects','equipment_quotes','equipment_quote_items'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.audit_trigger()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s_read" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "%s_admin_write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;
