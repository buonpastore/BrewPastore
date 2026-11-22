-- Vendite: se le bottiglie vendute sono state tolte dalla cantina di chi vende
alter table public.sales add column if not exists from_cellar boolean not null default false;
notify pgrst, 'reload schema';
