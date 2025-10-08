-- Fix Doodle Hunt Solo active game uniqueness
-- Problem: UNIQUE(user_id, status) prevents more than one 'won' or 'lost' game per user.
-- Solution: Drop that constraint and add a partial unique index for only 'in_progress'.

-- Drop constraint if it exists (may be defined as a table constraint)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'doodle_hunt_solo'
      AND c.conname = 'one_active_game_per_user'
  ) THEN
    ALTER TABLE public.doodle_hunt_solo DROP CONSTRAINT one_active_game_per_user;
  END IF;
END $$;

-- Drop an index with the same name if it was created as such (safety)
DROP INDEX IF EXISTS one_active_game_per_user;

-- Create a proper partial unique index to allow multiple completed games
CREATE UNIQUE INDEX IF NOT EXISTS one_active_doodle_hunt_per_user
  ON public.doodle_hunt_solo(user_id)
  WHERE status = 'in_progress';


