-- Daerlieth tracker: one row per character. Run once in the Supabase SQL editor.

create table if not exists public.trackers (
  id text primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.trackers enable row level security;

-- Anyone with the link can read (the GM view needs no account).
drop policy if exists "trackers are public to read" on public.trackers;
create policy "trackers are public to read" on public.trackers
  for select using (true);

-- Only the owner can change the row, and cannot hand it to someone else.
drop policy if exists "owner updates own tracker" on public.trackers;
create policy "owner updates own tracker" on public.trackers
  for update to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- No insert or delete policy: rows are created by the seed below, as the database owner.

-- Push every save to open pages.
do $$ begin
  alter publication supabase_realtime add table public.trackers;
exception when duplicate_object then null;
end $$;

-- Seed Daerlieth's row. Create the player's user first (Authentication > Users > Add user),
-- then put her email here and run this part.
insert into public.trackers (id, owner)
select 'daerlieth', id from auth.users where email = 'PLAYER_EMAIL_HERE'
on conflict (id) do update set owner = excluded.owner;
