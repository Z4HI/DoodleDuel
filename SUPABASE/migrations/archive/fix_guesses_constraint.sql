-- Fix the guesses table constraint to allow guess_number > 5
-- Users can now continue guessing after watching ads, so we need to remove the upper limit

-- Drop the existing constraint
ALTER TABLE public.guesses 
DROP CONSTRAINT IF EXISTS guesses_guess_number_check;

-- Add a new constraint that only checks for positive numbers
ALTER TABLE public.guesses 
ADD CONSTRAINT guesses_guess_number_check CHECK (guess_number >= 1);

-- Also fix the duel guesses table if it has the same constraint
ALTER TABLE public.doodle_hunt_duel_guesses 
DROP CONSTRAINT IF EXISTS doodle_hunt_duel_guesses_guess_number_check;

-- Add a new constraint for duel guesses that only checks for positive numbers
ALTER TABLE public.doodle_hunt_duel_guesses 
ADD CONSTRAINT doodle_hunt_duel_guesses_guess_number_check CHECK (guess_number >= 1);
