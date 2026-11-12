-- =====================================================================
-- BREWPASTORE - degustazioni: ognuno dei soci valuta i batch
-- =====================================================================
create table public.tastings (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references public.batches(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) default auth.uid(),
  tasted_on    date not null default current_date,
  rating       int not null check (rating between 1 and 5),     -- voto complessivo (stelle)
  appearance   text,      -- aspetto: colore, limpidezza, schiuma
  aroma        text,
  flavor       text,      -- gusto
  mouthfeel    text,      -- corpo, carbonazione
  serving_temp_c numeric(4,1),
  notes        text,
  would_brew_again boolean,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index tastings_batch_idx on public.tastings (batch_id);

create trigger tastings_touch before update on public.tastings for each row execute function public.touch_updated_at();
create trigger tastings_audit after insert or update or delete on public.tastings for each row execute function public.audit_trigger();

alter table public.tastings enable row level security;
create policy "tastings_read"   on public.tastings for select to authenticated using (true);
create policy "tastings_insert" on public.tastings for insert to authenticated with check (user_id = auth.uid());
create policy "tastings_update" on public.tastings for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "tastings_delete" on public.tastings for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- media voti per batch
create view public.tasting_summary with (security_invoker = true) as
select b.id as batch_id, b.code, b.recipe_id, count(t.id) as tastings_count, round(avg(t.rating)::numeric, 2) as avg_rating
from public.batches b left join public.tastings t on t.batch_id = b.id
group by b.id;
