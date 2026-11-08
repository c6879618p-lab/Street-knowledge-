-- Street Knowledge public address pins.
-- Smallest free-tier setup that keeps a pin visible after the creator closes the app,
-- and lets only that signed-in account edit or delete it.
--
-- Use a free Supabase project (Postgres + Auth). Do not deploy this from the app.
-- Do not put the database password or the service_role key in the client.
-- The project URL and anon key, if used, are supplied at runtime. They are not in this repo.
--
-- Setup:
-- 1. Create a free project at https://supabase.com (no charge for the free quota).
-- 2. Authentication → Providers → Email: leave email sign-in on (magic link). Do not enable anonymous sign-in.
-- 3. Paste this file into the SQL editor and run it. Leave Row Level Security enabled.
-- 4. Authentication → URL configuration: add the site origin you will use after you choose to connect the app.
-- 5. When you are ready to connect, pass the project URL, the anon key, and the signed-in user's access token
--    into PublicPins.createSupabaseStore at runtime. Never commit those values.
--
-- What this enforces:
-- * Anyone may read rows whose visibility is public, including after the owner goes offline.
-- * Insert, update, and delete require a Supabase Auth JWT.
-- * owner_id is auth.uid(). A client cannot assign the pin to someone else.
-- * Another signed-in user cannot edit or delete it.

create table if not exists public.public_pins (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lon double precision not null,
  lat double precision not null,
  address text not null check (char_length(address) between 1 and 160),
  label text not null default '' check (char_length(label) <= 40),
  visibility text not null default 'public' check (visibility = 'public'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_pins_coords check (lat >= -90 and lat <= 90 and lon >= -180 and lon <= 180)
);

create index if not exists public_pins_owner_idx on public.public_pins (owner_id);

alter table public.public_pins enable row level security;

drop policy if exists public_pins_read on public.public_pins;
create policy public_pins_read on public.public_pins
  for select to anon, authenticated
  using (visibility = 'public');

drop policy if exists public_pins_insert on public.public_pins;
create policy public_pins_insert on public.public_pins
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists public_pins_update on public.public_pins;
create policy public_pins_update on public.public_pins
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and visibility = 'public');

drop policy if exists public_pins_delete on public.public_pins;
create policy public_pins_delete on public.public_pins
  for delete to authenticated
  using (owner_id = auth.uid());

grant select on public.public_pins to anon, authenticated;
grant insert, update, delete on public.public_pins to authenticated;

create or replace function public.touch_public_pin()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.owner_id = auth.uid();
  return new;
end;
$$;

drop trigger if exists public_pins_touch on public.public_pins;
create trigger public_pins_touch
  before update on public.public_pins
  for each row execute function public.touch_public_pin();
