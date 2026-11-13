-- Colori dei tappi disponibili (modificabili da Impostazioni). Per ora: rosso, arancione, giallo, verde, bianco.
create table if not exists public.cap_colors (
  key        text primary key,
  label      text not null,
  hex        text not null,
  sort_order int  not null default 0
);
alter table public.cap_colors enable row level security;
drop policy if exists "cap_colors_read" on public.cap_colors;
create policy "cap_colors_read" on public.cap_colors for select to authenticated using (true);
drop policy if exists "cap_colors_admin_write" on public.cap_colors;
create policy "cap_colors_admin_write" on public.cap_colors for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.cap_colors (key, label, hex, sort_order) values
  ('rosso',   'Rosso',     '#c62828', 1),
  ('arancio', 'Arancione', '#ef7d1a', 2),
  ('giallo',  'Giallo',    '#f5d300', 3),
  ('verde',   'Verde',     '#2e9d3a', 4),
  ('bianco',  'Bianco',    '#f6f3ec', 5)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
