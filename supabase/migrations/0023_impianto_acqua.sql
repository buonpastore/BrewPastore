-- Dati dell'impianto per il calcolatore dell'acqua (uguali per tutti, si cambiano in Impostazioni → Impianto)
insert into public.settings (key, value, label, unit) values
  ('water_ratio',      3, 'Rapporto acqua/grani', 'L/kg'),
  ('water_boiloff',    3, 'Evaporazione in bollitura', 'L/ora'),
  ('water_absorption', 1, 'Assorbimento dei grani', 'L/kg'),
  ('water_losses',     2, 'Perdite (trub, tubi, fondo)', 'L')
on conflict (key) do nothing;
notify pgrst, 'reload schema';
