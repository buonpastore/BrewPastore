-- Task assegnabili a più persone.
alter table public.tasks add column if not exists assignees uuid[] not null default '{}';
update public.tasks set assignees = array[assignee] where assignee is not null and (assignees is null or cardinality(assignees) = 0);

notify pgrst, 'reload schema';
