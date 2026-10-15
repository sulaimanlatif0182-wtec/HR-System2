-- 0008: visual seat swaps for the radial org chart (reporting lines untouched).
-- One row per swapped pair; a circle holds N rows. Pairs are stored in
-- canonical order (member_a_id < member_b_id) so dedupe is a plain UNIQUE.
-- The chart reader must still ignore rows whose members are no longer
-- direct reports of manager_id (ids change when staff are re-hired).
CREATE TABLE IF NOT EXISTS public.org_chart_seat_swaps (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  manager_id  integer NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  member_a_id integer NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  member_b_id integer NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seat_swaps_canonical   CHECK (member_a_id < member_b_id),
  CONSTRAINT seat_swaps_distinct    CHECK (member_a_id <> member_b_id),
  CONSTRAINT seat_swaps_not_manager CHECK (manager_id <> member_a_id AND manager_id <> member_b_id),
  CONSTRAINT seat_swaps_unique_pair UNIQUE (manager_id, member_a_id, member_b_id)
);

-- One member takes part in at most one swap per circle.
CREATE OR REPLACE FUNCTION public.enforce_seat_swap_member_unique()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.org_chart_seat_swaps s
    WHERE s.manager_id = NEW.manager_id
      AND s.id <> COALESCE(NEW.id, -1)
      AND (NEW.member_a_id IN (s.member_a_id, s.member_b_id)
        OR NEW.member_b_id IN (s.member_a_id, s.member_b_id))
  ) THEN
    RAISE EXCEPTION 'member already swapped in circle %', NEW.manager_id
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seat_swap_member_unique ON public.org_chart_seat_swaps;
CREATE TRIGGER trg_seat_swap_member_unique
  BEFORE INSERT OR UPDATE ON public.org_chart_seat_swaps
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_swap_member_unique();

-- Postgres does not auto-index FK child columns; cascade deletes need these.
CREATE INDEX IF NOT EXISTS idx_seat_swaps_member_a
  ON public.org_chart_seat_swaps (member_a_id);
CREATE INDEX IF NOT EXISTS idx_seat_swaps_member_b
  ON public.org_chart_seat_swaps (member_b_id);

-- Reads are public; writes go through the service-role backend, which
-- bypasses RLS, so no write policy is created (authZ is hand-coded in API).
ALTER TABLE public.org_chart_seat_swaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seat_swaps_read ON public.org_chart_seat_swaps;
CREATE POLICY seat_swaps_read ON public.org_chart_seat_swaps
  FOR SELECT USING (true);

-- Seed: the one surviving hardcoded swap (Henry Hoo circle).
INSERT INTO public.org_chart_seat_swaps (manager_id, member_a_id, member_b_id, created_by)
VALUES (66, 74, 92, 'migration:0008')
ON CONFLICT (manager_id, member_a_id, member_b_id) DO NOTHING;
