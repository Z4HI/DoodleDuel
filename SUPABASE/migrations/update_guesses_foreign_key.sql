-- Update guesses table to support both solo and dash games
-- This migration removes the foreign key constraint and adds a check constraint

-- First, drop the existing foreign key constraint
ALTER TABLE public.guesses 
DROP CONSTRAINT IF EXISTS guesses_game_id_fkey;

-- Add a check constraint to ensure game_id exists in either table
ALTER TABLE public.guesses 
ADD CONSTRAINT guesses_game_id_check 
CHECK (
  EXISTS (SELECT 1 FROM public.doodle_hunt_solo WHERE id = game_id) OR
  EXISTS (SELECT 1 FROM public.doodle_hunt_dash_games WHERE id = game_id)
);

-- Create indexes for better performance on the checks
CREATE INDEX IF NOT EXISTS idx_guesses_game_id_solo ON public.doodle_hunt_solo(id);
CREATE INDEX IF NOT EXISTS idx_guesses_game_id_dash ON public.doodle_hunt_dash_games(id);

-- Add a comment explaining the constraint
COMMENT ON CONSTRAINT guesses_game_id_check ON public.guesses IS 
'Ensures game_id exists in either doodle_hunt_solo or doodle_hunt_dash_games table';
