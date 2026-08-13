create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  played_at timestamptz not null default now(),
  num_holes int not null check (num_holes in (9, 18)),
  location text,
  ball_color text,
  spinner_default text not null default 'preset',
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  name text not null,
  sort_order int not null
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  hole_number int not null,
  strokes int not null,
  unique (player_id, hole_number)
);

create table if not exists spinner_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  hole_number int not null,
  result_label text not null,
  result_description text,
  unique (player_id, hole_number)
);

create table if not exists spinner_options (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  description text,
  weight int not null default 1,
  active boolean not null default true
);

-- RPC Functions
-- create or replace function get_option(option_num int)
-- returns table (id uuid, label text, description text, weight int, active boolean)
-- as $$ ... $$ language plpgsql;

-- create or replace function get_random(n int)
-- returns table (id uuid, label text, description text, weight int, active boolean)
-- as $$ ... $$ language plpgsql;
