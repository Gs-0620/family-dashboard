-- Initial schema for an empty Supabase project; not a migration for existing tables.
begin;

create table public.config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() unique references auth.users(id) on delete cascade,
  city text not null default '',
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  lmp date,
  due_date date,
  avoid_tags text[] not null default '{}',
  nickname text not null default '',
  updated_at timestamptz not null default now(),
  constraint config_one_pregnancy_basis check ((lmp is null) <> (due_date is null))
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  amount numeric(12,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
  category text not null,
  payment_method text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.checkups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  item text not null,
  hospital_note text not null default '',
  next_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  weight numeric(6,2) not null check (weight > 0 and weight <> 'NaN'::numeric),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner')),
  tags text[] not null default '{}',
  conflict_tags text[] not null default '{}',
  duration_min integer not null check (duration_min > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_user_date_idx on public.expenses (user_id, date desc);
create index checkups_user_date_idx on public.checkups (user_id, date desc);
create index weights_user_date_idx on public.weights (user_id, date desc);
create index todos_user_done_idx on public.todos (user_id, done);
create index meals_user_type_idx on public.meals (user_id, meal_type);

-- Security invoker: only stamps the row already permitted by RLS.
create function public.family_dashboard_stamp_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.family_dashboard_stamp_updated_at() from public, anon;
grant execute on function public.family_dashboard_stamp_updated_at() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['config', 'expenses', 'checkups', 'weights', 'todos', 'meals']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format(
      'create policy own_rows on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name
    );
    execute format(
      'create trigger stamp_updated_at before update on public.%I for each row execute function public.family_dashboard_stamp_updated_at()',
      table_name
    );
    -- Keep DEFAULT identity: DELETE notifications contain the primary key, not private row data.
    execute format('alter table public.%I replica identity default', table_name);
  end loop;
end;
$$;

grant usage on schema public to authenticated;

do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach table_name in array array['config', 'expenses', 'checkups', 'weights', 'todos', 'meals']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

commit;
