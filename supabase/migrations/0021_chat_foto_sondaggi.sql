-- Chat: foto nei messaggi e sondaggi (tutti votano e possono aggiungere opzioni)
alter table public.messages add column if not exists image_path text;

create table if not exists public.polls (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null unique references public.messages(id) on delete cascade,
  question    text not null check (length(question) between 1 and 300),
  multi       boolean not null default false,          -- si possono scegliere più opzioni
  created_by  uuid not null default auth.uid() references public.profiles(id),
  created_at  timestamptz not null default now()
);
create table if not exists public.poll_options (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.polls(id) on delete cascade,
  text        text not null check (length(text) between 1 and 120),
  created_by  uuid not null default auth.uid() references public.profiles(id),
  created_at  timestamptz not null default now()
);
create table if not exists public.poll_votes (
  option_id   uuid not null references public.poll_options(id) on delete cascade,
  poll_id     uuid not null references public.polls(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (option_id, user_id)
);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists "polls_read" on public.polls;
create policy "polls_read" on public.polls for select to authenticated using (true);
drop policy if exists "polls_insert" on public.polls;
create policy "polls_insert" on public.polls for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "polls_delete" on public.polls;
create policy "polls_delete" on public.polls for delete to authenticated using (created_by = auth.uid() or public.is_admin());

drop policy if exists "poll_options_read" on public.poll_options;
create policy "poll_options_read" on public.poll_options for select to authenticated using (true);
drop policy if exists "poll_options_insert" on public.poll_options;
create policy "poll_options_insert" on public.poll_options for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "poll_options_delete" on public.poll_options;
create policy "poll_options_delete" on public.poll_options for delete to authenticated using (created_by = auth.uid() or public.is_admin());

drop policy if exists "poll_votes_read" on public.poll_votes;
create policy "poll_votes_read" on public.poll_votes for select to authenticated using (true);
drop policy if exists "poll_votes_insert" on public.poll_votes;
create policy "poll_votes_insert" on public.poll_votes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "poll_votes_delete" on public.poll_votes;
create policy "poll_votes_delete" on public.poll_votes for delete to authenticated using (user_id = auth.uid());

-- foto della chat: ognuno carica nella sua cartella chat/<id utente>/
drop policy if exists "chat_files_insert" on storage.objects;
create policy "chat_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = 'chat' and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "chat_files_delete" on storage.objects;
create policy "chat_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'chat' and (storage.foldername(name))[2] = auth.uid()::text);

-- voti e nuove opzioni arrivano in tempo reale
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.poll_options; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.poll_votes; exception when duplicate_object then null; end;
  end if;
end $$;

notify pgrst, 'reload schema';
