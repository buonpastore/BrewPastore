-- Task: segno «importante» (messa in evidenza in Home e nelle task)
alter table public.tasks add column if not exists important boolean not null default false;
notify pgrst, 'reload schema';
