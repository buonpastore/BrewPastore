-- Colore del tappo scelto all'imbottigliamento, per riconoscere le birre in cantina.
alter table public.batches add column if not exists cap_color text;

notify pgrst, 'reload schema';
