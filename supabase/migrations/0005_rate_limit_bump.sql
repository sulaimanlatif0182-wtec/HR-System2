-- 0005_rate_limit_bump.sql
-- Atomic sliding-window rate limit bump. Replaces the read-then-upsert
-- sequence in lib/rateLimit.js with a single row-locked statement, so
-- concurrent requests for the same key cannot both pass the limit.
-- Idempotent: can be run multiple times safely.

create or replace function public.rate_limit_bump(
  p_key text,
  p_window_ms bigint,
  p_max bigint
)
returns table (is_limited boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row rate_limits%rowtype;
begin
  -- Row lock: concurrent calls for the same key serialize here.
  select * into v_row
  from rate_limits
  where key = p_key
  for update;

  if v_row is null then
    insert into rate_limits (key, window_start, count, updated_at)
    values (p_key, now(), 1, now());
    return query select false;
    return;
  end if;

  if (extract(epoch from (now() - v_row.window_start)) * 1000) > p_window_ms then
    update rate_limits
    set window_start = now(), count = 1, updated_at = now()
    where key = p_key;
    return query select false;
    return;
  end if;

  update rate_limits
  set count = v_row.count + 1, updated_at = now()
  where key = p_key;

  return query select (v_row.count + 1) > p_max;
end;
$$;

revoke all on function public.rate_limit_bump(text, bigint, bigint) from public;

grant execute on function public.rate_limit_bump(text, bigint, bigint)
  to service_role;
