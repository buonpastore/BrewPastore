-- =====================================================================
-- BREWPASTORE - eliminando una spesa si eliminano anche i pagamenti delle quote collegati
-- =====================================================================
alter table public.settlements
  drop constraint if exists settlements_expense_id_fkey,
  add constraint settlements_expense_id_fkey
    foreign key (expense_id) references public.expenses(id) on delete cascade;

notify pgrst, 'reload schema';
