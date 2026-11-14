-- Stati del batch: cotta → fermentata → imbottigliata → degustata → esaurita (fine del ciclo).
-- «In maturazione» diventa «fermentata», «finito» (prima degustazione) diventa «degustato».
alter table public.batches drop constraint if exists batches_status_check;
update public.batches set status = 'fermentazione' where status = 'maturazione';
update public.batches set status = 'degustato' where status = 'finito';
alter table public.batches add constraint batches_status_check
  check (status in ('pianificato','cotta','fermentazione','imbottigliato','degustato','esaurito'));
notify pgrst, 'reload schema';
