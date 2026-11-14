-- Preventivi impianto: tre stati (inserito, in valutazione, confermato) e conferma di ogni riga
alter table public.equipment_quotes drop constraint if exists equipment_quotes_status_check;
update public.equipment_quotes set status = case status
  when 'ricevuto' then 'inserito'
  when 'in_trattativa' then 'in_valutazione'
  when 'scelto' then 'confermato'
  else status end;
alter table public.equipment_quotes alter column status set default 'inserito';
alter table public.equipment_quotes add constraint equipment_quotes_status_check
  check (status in ('inserito','in_valutazione','confermato','scartato','superato'));

-- ogni riga: confermata (da comprare) oppure ancora in valutazione
alter table public.equipment_quote_items add column if not exists confirmed boolean not null default false;
notify pgrst, 'reload schema';
