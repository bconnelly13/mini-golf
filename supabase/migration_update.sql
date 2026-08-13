-- 1. Add spinner_default column to games table
alter table games 
add column if not exists spinner_default text not null default 'preset';

-- 2. Add result_description column to spinner_results table
alter table spinner_results 
add column if not exists result_description text;

-- 3. Add description column to spinner_options table
alter table spinner_options 
add column if not exists description text;

-- 4. Standard/Fallback definitions of the RPC functions if you need to recreate them
-- Note: Replace with your custom pool filtering if needed.

-- get_option returns active options, potentially filtered or selected deterministically
create or replace function get_option(option_num int)
returns table (
  id uuid,
  label text,
  description text,
  weight int,
  active boolean
) as $$
begin
  return query
  select 
    so.id, 
    so.label, 
    so.description, 
    so.weight, 
    so.active
  from spinner_options so
  where so.active = true
  -- We can use option_num to deterministically select a subset or order them, 
  -- but a simple fetch of active options or paginated/modulo subset is typical.
  -- Here is a standard implementation selecting based on ID hashing or modulo:
  order by (hashtext(so.id::text) % 9) = option_num or so.id asc
  limit 6;
end;
$$ language plpgsql stable;

-- get_random returns n active random options
create or replace function get_random(n int)
returns table (
  id uuid,
  label text,
  description text,
  weight int,
  active boolean
) as $$
begin
  return query
  select 
    so.id, 
    so.label, 
    so.description, 
    so.weight, 
    so.active
  from spinner_options so
  where so.active = true
  order by random()
  limit n;
end;
$$ language plpgsql stable;
