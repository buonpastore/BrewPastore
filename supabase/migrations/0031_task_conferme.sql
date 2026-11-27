-- Task: chi riceve una task da un altro conferma che la fa (o dice che non può)
alter table public.tasks add column if not exists confirmed uuid[] not null default '{}';
alter table public.tasks add column if not exists declined  uuid[] not null default '{}';

-- conferma (sì = la faccio, no = non posso) della persona collegata, senza toccare le risposte degli altri
create or replace function public.task_answer(p_task uuid, p_yes boolean)
returns void language sql security invoker as $$
  update public.tasks
     set confirmed = case when p_yes then array_append(array_remove(confirmed, auth.uid()), auth.uid()) else array_remove(confirmed, auth.uid()) end,
         declined  = case when p_yes then array_remove(declined, auth.uid()) else array_append(array_remove(declined, auth.uid()), auth.uid()) end,
         updated_at = now()
   where id = p_task;
$$;
grant execute on function public.task_answer(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
