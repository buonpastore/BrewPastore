-- Task: le cose da fare. Ognuno può crearle, assegnarle, cambiarne lo stato e aggiungere note con file o foto.
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  assignee    uuid references public.profiles(id) on delete set null,
  created_by  uuid not null references public.profiles(id) default auth.uid(),
  status      text not null default 'inserita' check (status in ('inserita', 'in_corso', 'terminata')),
  due_date    date,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.task_notes (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) default auth.uid(),
  body       text,
  file_path  text,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;
alter table public.task_notes enable row level security;

drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read" on public.tasks for select to authenticated using (true);
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks for insert to authenticated with check (created_by = auth.uid() or public.is_admin());
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks for update to authenticated using (true) with check (true);   -- tutti possono cambiare stato e note
drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks for delete to authenticated using (created_by = auth.uid() or public.is_admin());

drop policy if exists "task_notes_read" on public.task_notes;
create policy "task_notes_read" on public.task_notes for select to authenticated using (true);
drop policy if exists "task_notes_insert" on public.task_notes;
create policy "task_notes_insert" on public.task_notes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "task_notes_delete" on public.task_notes;
create policy "task_notes_delete" on public.task_notes for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- allegati delle task: ognuno carica nella sua cartella tasks/<id utente>/
drop policy if exists "task_files_insert" on storage.objects;
create policy "task_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = 'tasks' and (storage.foldername(name))[2] = auth.uid()::text);

notify pgrst, 'reload schema';
