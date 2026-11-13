-- Prezzo delle bottiglie in configurazione (anche senza scontrino d'acquisto).
-- Pacco da 24 bottiglie da 66 cl a 11 €; quelle da 33 cl ancora da definire (0 = non impostato).
insert into public.settings (key, value, label, unit) values
  ('bottle_66_pack_price', 11, 'Bottiglie 66 cl: prezzo del pacco',  '€'),
  ('bottle_66_pack_qty',   24, 'Bottiglie 66 cl: bottiglie nel pacco', 'pz'),
  ('bottle_33_pack_price', 0,  'Bottiglie 33 cl: prezzo del pacco (0 = non impostato)', '€'),
  ('bottle_33_pack_qty',   24, 'Bottiglie 33 cl: bottiglie nel pacco', 'pz')
on conflict (key) do nothing;
