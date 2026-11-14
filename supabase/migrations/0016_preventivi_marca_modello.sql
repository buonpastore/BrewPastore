-- Preventivi impianto: per ogni riga anche fornitore (dove si compra), marca e modello
alter table public.equipment_quote_items add column if not exists supplier text;
alter table public.equipment_quote_items add column if not exists brand    text;
alter table public.equipment_quote_items add column if not exists model    text;
notify pgrst, 'reload schema';
