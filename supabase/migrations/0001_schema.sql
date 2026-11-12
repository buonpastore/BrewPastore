-- =====================================================================
-- BREWPASTORE - schema database (Supabase / Postgres)
-- Eseguire nello SQL Editor di Supabase (una volta sola).
-- =====================================================================

-- ---------- Utenti e ruoli -------------------------------------------
create type public.user_role as enum ('admin', 'viewer');

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role         public.user_role not null default 'viewer',
  created_at   timestamptz not null default now()
);

-- crea il profilo automaticamente quando aggiungi un utente in Supabase Auth
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- Impostazioni (prezzo energia ecc.) ----------------------
create table public.settings (
  key        text primary key,
  value      numeric not null,
  label      text not null,
  unit       text not null default ''
);
insert into public.settings (key, value, label, unit) values
  ('energy_price_kwh', 0.30, 'Prezzo energia elettrica', '€/kWh'),
  ('gas_price_m3',     1.10, 'Prezzo gas',               '€/m³'),
  ('water_price_l',    0.002,'Prezzo acqua',             '€/L');

-- ---------- Materie prime e acquisti --------------------------------
-- unità base: kg (solidi), l (liquidi), pz (pezzi)
create table public.materials (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  category   text not null default 'altro'
             check (category in ('malto','luppolo','lievito','sali_acqua','additivo','bottiglie','tappi','etichette','detergenti','altro')),
  base_unit  text not null default 'kg' check (base_unit in ('kg','l','pz')),
  notes      text,
  created_at timestamptz not null default now()
);

-- converte quantità nell'unità base
create or replace function public.to_base_qty(qty numeric, unit text) returns numeric
language sql immutable as $$
  select case lower(unit)
    when 'g'  then qty / 1000
    when 'mg' then qty / 1000000
    when 'ml' then qty / 1000
    when 'cl' then qty / 100
    else qty end;
$$;

create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  kind         text not null default 'altro'
               check (kind in ('fattura','scontrino','email','foto','scheda_tecnica','etichetta','altro')),
  storage_path text not null,
  mime_type    text,
  size_bytes   bigint,
  recipe_id    uuid,
  batch_id     uuid,
  purchase_id  uuid,
  notes        text,
  uploaded_by  uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now()
);

create table public.purchases (
  id            uuid primary key default gen_random_uuid(),
  supplier      text not null,
  purchase_date date not null default current_date,
  invoice_number text,
  shipping_cost numeric(10,2) not null default 0,
  total_amount  numeric(10,2),
  notes         text,
  document_id   uuid references public.documents(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table public.purchase_items (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  description text,
  quantity    numeric(12,4) not null check (quantity > 0),
  unit        text not null default 'kg',
  total_price numeric(10,2) not null check (total_price >= 0)   -- IVA inclusa
);

-- ---------- Ricette --------------------------------------------------
create table public.recipes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  style         text,
  description   text,
  batch_size_l  numeric(6,2),
  boil_time_min int,
  mash_temp_c   numeric(4,1),
  mash_time_min int,
  target_og     numeric(5,3),
  target_fg     numeric(5,3),
  target_ibu    numeric(5,1),
  target_ebc    numeric(5,1),
  efficiency_pct numeric(4,1),
  procedure     text,
  notes         text,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.recipe_ingredients (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null,
  name        text not null,
  category    text not null default 'altro',
  quantity    numeric(12,4) not null,
  unit        text not null default 'kg',
  step        text,          -- es. "mash", "60 min", "dry hop giorno 3"
  sort_order  int not null default 0
);

-- ---------- Cotte (batch) -------------------------------------------
create table public.batches (
  id                  uuid primary key default gen_random_uuid(),
  recipe_id           uuid not null references public.recipes(id) on delete restrict,
  code                text not null,               -- es. "IPA #3"
  status              text not null default 'pianificato'
                      check (status in ('pianificato','cotta','fermentazione','maturazione','imbottigliato','finito')),
  -- date
  brew_date           date,
  fermentation_start  date,
  bottling_date       date,
  first_tasting_date  date,
  -- acqua e mash
  water_ph_initial    numeric(4,2),
  water_ph_adjusted   numeric(4,2),
  mash_water_l        numeric(6,2),
  sparge_water_l      numeric(6,2),
  mash_ph             numeric(4,2),
  -- densità
  pre_sparge_gravity  numeric(5,3),
  post_sparge_gravity numeric(5,3),
  original_gravity    numeric(5,3),
  final_gravity       numeric(5,3),
  abv                 numeric(4,2) generated always as
                      (case when original_gravity is not null and final_gravity is not null
                            then round((original_gravity - final_gravity) * 131.25, 2) end) stored,
  -- volumi e confezionamento
  volume_fermenter_l  numeric(6,2),
  volume_bottled_l    numeric(6,2),
  bottles_count       int,
  bottle_size_l       numeric(4,3) default 0.33,
  -- carbonazione all'imbottigliamento
  carbonation_method  text check (carbonation_method in ('priming','fusto_forzata','spunding','naturale','altro')),
  priming_sugar_type  text,                         -- destrosio, saccarosio, miele, DME...
  priming_sugar_g     numeric(7,1),                 -- grammi totali usati
  target_co2_vol      numeric(3,1),                 -- volumi di CO2 obiettivo
  beer_temp_c         numeric(4,1),                 -- temperatura birra a fine fermentazione
  carbonation_notes   text,
  -- consumi
  energy_kwh          numeric(8,2),
  gas_m3              numeric(8,2),
  water_used_l        numeric(8,1),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.documents
  add constraint documents_recipe_fk  foreign key (recipe_id)  references public.recipes(id)   on delete set null,
  add constraint documents_batch_fk   foreign key (batch_id)   references public.batches(id)   on delete set null,
  add constraint documents_purchase_fk foreign key (purchase_id) references public.purchases(id) on delete set null;

-- correzioni dell'acqua (sali, acidi...)
create table public.water_adjustments (
  id        uuid primary key default gen_random_uuid(),
  batch_id  uuid not null references public.batches(id) on delete cascade,
  additive  text not null,            -- es. "Acido lattico 80%", "CaSO4"
  amount    numeric(10,3) not null,
  unit      text not null default 'g',
  target    text not null default 'mash' check (target in ('mash','sparge','bollitura','totale')),
  notes     text
);

-- ingredienti effettivamente usati (copiati dalla ricetta, modificabili)
create table public.batch_ingredients (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.batches(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null,
  name        text not null,
  category    text not null default 'altro',
  quantity    numeric(12,4) not null,
  unit        text not null default 'kg',
  step        text,
  unit_cost_override numeric(10,4)    -- €/unità base, se vuoi forzare il costo
);

-- diario di fermentazione / eventi
create table public.batch_events (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references public.batches(id) on delete cascade,
  event_at   timestamptz not null default now(),
  kind       text not null default 'nota'
             check (kind in ('nota','densita','temperatura','ph','dry_hop','travaso','assaggio','problema')),
  value      numeric(10,3),
  notes      text
);

-- costi extra del batch (bottiglie, tappi, etichette, CO2...)
create table public.batch_costs (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.batches(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null,  -- se presa da magazzino usa il costo medio
  category    text not null default 'altro'
              check (category in ('bottiglie','tappi','etichette','co2','detergenti','attrezzatura','altro')),
  description text not null,
  quantity    numeric(12,3) not null default 1,
  unit_cost   numeric(10,4)   -- se nullo e material_id presente => costo medio
);

-- ---------- Chat -----------------------------------------------------
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) default auth.uid(),
  recipe_id  uuid references public.recipes(id) on delete cascade,
  batch_id   uuid references public.batches(id) on delete cascade,
  body       text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- ---------- Storico versioni (audit) --------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   uuid not null,
  action      text not null check (action in ('INSERT','UPDATE','DELETE')),
  version     int not null,
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid default auth.uid(),
  changed_at  timestamptz not null default now()
);
create index audit_log_record_idx on public.audit_log (table_name, record_id, version);
create index audit_log_time_idx   on public.audit_log (changed_at desc);

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
  v   int;
begin
  rid := coalesce((case when tg_op = 'DELETE' then old.id else new.id end));
  select coalesce(max(version), 0) + 1 into v
    from public.audit_log where table_name = tg_table_name and record_id = rid;
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
    return new;  -- nessuna modifica reale
  end if;
  insert into public.audit_log (table_name, record_id, action, version, old_data, new_data)
  values (tg_table_name, rid, tg_op, v,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create trigger recipes_touch before update on public.recipes for each row execute function public.touch_updated_at();
create trigger batches_touch before update on public.batches for each row execute function public.touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['recipes','recipe_ingredients','batches','water_adjustments','batch_ingredients',
                           'batch_events','batch_costs','materials','purchases','purchase_items','documents']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

-- ---------- Viste costi ---------------------------------------------
-- costo medio ponderato per materia prima (spedizione ripartita sul valore della merce)
create view public.material_costs with (security_invoker = true) as
with items as (
  select pi.material_id,
         public.to_base_qty(pi.quantity, pi.unit) as qty_base,
         pi.total_price
           + case when tot.goods > 0 then p.shipping_cost * pi.total_price / tot.goods else 0 end as cost
  from public.purchase_items pi
  join public.purchases p on p.id = pi.purchase_id
  join (select purchase_id, sum(total_price) goods from public.purchase_items group by purchase_id) tot
    on tot.purchase_id = pi.purchase_id
)
select m.id as material_id, m.name, m.category, m.base_unit,
       coalesce(sum(i.qty_base), 0)                         as qty_purchased,
       coalesce(sum(i.cost), 0)                             as total_spent,
       case when sum(i.qty_base) > 0 then sum(i.cost) / sum(i.qty_base) end as avg_unit_cost,
       count(i.*)                                           as purchases_count
from public.materials m
left join items i on i.material_id = m.id
group by m.id;

-- costo per batch
create view public.batch_cost_summary with (security_invoker = true) as
with ing as (
  select bi.batch_id,
         sum(public.to_base_qty(bi.quantity, bi.unit) * coalesce(bi.unit_cost_override, mc.avg_unit_cost, 0)) as cost,
         bool_or(bi.unit_cost_override is null and mc.avg_unit_cost is null) as missing_prices
  from public.batch_ingredients bi
  left join public.material_costs mc on mc.material_id = bi.material_id
  group by bi.batch_id
), extra as (
  select bc.batch_id,
         sum(bc.quantity * coalesce(bc.unit_cost, mc.avg_unit_cost, 0)) as cost
  from public.batch_costs bc
  left join public.material_costs mc on mc.material_id = bc.material_id
  group by bc.batch_id
)
select b.id as batch_id, b.code, b.recipe_id,
       coalesce(ing.cost, 0)                                                   as ingredients_cost,
       coalesce(extra.cost, 0)                                                 as extra_cost,
       coalesce(b.energy_kwh, 0) * (select value from public.settings where key = 'energy_price_kwh') as energy_cost,
       coalesce(b.gas_m3, 0)     * (select value from public.settings where key = 'gas_price_m3')     as gas_cost,
       coalesce(b.water_used_l, 0) * (select value from public.settings where key = 'water_price_l')  as water_cost,
       coalesce(ing.missing_prices, false)                                     as missing_prices,
       b.bottles_count, b.volume_bottled_l
from public.batches b
left join ing   on ing.batch_id = b.id
left join extra on extra.batch_id = b.id;

-- ---------- Row Level Security --------------------------------------
-- tutti gli utenti autenticati leggono; solo l'admin scrive.
do $$
declare t text;
begin
  foreach t in array array['settings','materials','documents','purchases','purchase_items','recipes',
                           'recipe_ingredients','batches','water_adjustments','batch_ingredients',
                           'batch_events','batch_costs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s_read" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "%s_admin_write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy "profiles_read" on public.profiles for select to authenticated using (true);
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy "profiles_admin" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.messages enable row level security;
create policy "messages_read"   on public.messages for select to authenticated using (true);
create policy "messages_insert" on public.messages for insert to authenticated with check (user_id = auth.uid());
create policy "messages_delete" on public.messages for delete to authenticated using (user_id = auth.uid() or public.is_admin());

alter table public.audit_log enable row level security;
create policy "audit_read" on public.audit_log for select to authenticated using (true);
-- nessuna policy di scrittura: solo il trigger (security definer) scrive

-- ---------- Storage (file/documenti) --------------------------------
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "docs_read"  on storage.objects for select to authenticated using (bucket_id = 'documents');
create policy "docs_write" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and public.is_admin());
create policy "docs_update" on storage.objects for update to authenticated using (bucket_id = 'documents' and public.is_admin());
create policy "docs_delete" on storage.objects for delete to authenticated using (bucket_id = 'documents' and public.is_admin());

-- ---------- Realtime per la chat ------------------------------------
alter publication supabase_realtime add table public.messages;
