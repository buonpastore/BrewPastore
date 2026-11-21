-- Batch: data in cui la birra è finita (esaurita)
alter table public.batches add column if not exists depleted_date date;
-- i batch già esauriti: come data provvisoria l'ultima registrata (da correggere a mano se serve)
update public.batches
   set depleted_date = coalesce(first_tasting_date, bottling_date, fermentation_start, brew_date)
 where status = 'esaurito' and depleted_date is null;
notify pgrst, 'reload schema';
