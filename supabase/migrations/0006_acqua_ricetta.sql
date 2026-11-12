-- =====================================================================
-- BREWPASTORE - acqua di mash e di sparge nella ricetta
-- =====================================================================
alter table public.recipes
  add column if not exists mash_water_l   numeric(6,2),   -- acqua di mash (ammostamento)
  add column if not exists sparge_water_l numeric(6,2);   -- acqua di sparge (risciacquo)

-- fa rileggere subito la struttura del database all'app (evita l'errore "schema cache")
notify pgrst, 'reload schema';
