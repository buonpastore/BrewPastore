-- Ricavi: prezzo a cui vendete una bottiglia di ogni birra
alter table public.recipes add column if not exists sale_price numeric(8,2);
notify pgrst, 'reload schema';
