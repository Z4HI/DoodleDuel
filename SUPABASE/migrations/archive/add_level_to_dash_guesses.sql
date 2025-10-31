-- Add level column to doodle_hunt_dash_guesses table
ALTER TABLE public.doodle_hunt_dash_guesses 
ADD COLUMN level INTEGER NOT NULL DEFAULT 1;

-- Create index for level queries
CREATE INDEX idx_dash_guesses_level ON public.doodle_hunt_dash_guesses(level);

-- Update existing guesses to have level 1 (if any exist)
UPDATE public.doodle_hunt_dash_guesses 
SET level = 1 
WHERE level IS NULL OR level = 1;
