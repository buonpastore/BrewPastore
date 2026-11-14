-- Nuovo stato del batch: «esaurito» = birra finita, non ce l'ha più nessuno (va nello storico)
alter table public.batches drop constraint if exists batches_status_check;
alter table public.batches add constraint batches_status_check
  check (status in ('pianificato','cotta','fermentazione','maturazione','imbottigliato','finito','esaurito'));
notify pgrst, 'reload schema';
