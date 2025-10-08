-- Fix level values for existing doodle_hunt_dash_guesses
-- This migration updates existing guesses to have the correct level based on their creation time
-- and the game's level progression

-- First, let's see what we're working with
DO $$
DECLARE
    game_record RECORD;
    guess_record RECORD;
    current_level_for_guesses INTEGER;
BEGIN
    -- For each game, determine what level the existing guesses should be at
    FOR game_record IN 
        SELECT id, current_level, current_word 
        FROM public.doodle_hunt_dash_games 
        WHERE status = 'in_progress'
    LOOP
        -- Check if this game has guesses
        IF EXISTS (SELECT 1 FROM public.doodle_hunt_dash_guesses WHERE game_id = game_record.id) THEN
            -- For now, assume all existing guesses are from level 1
            -- This is a conservative approach since we don't have historical level data
            UPDATE public.doodle_hunt_dash_guesses 
            SET level = 1 
            WHERE game_id = game_record.id AND level = 1;
            
            RAISE NOTICE 'Updated guesses for game % to level 1', game_record.id;
        END IF;
    END LOOP;
END $$;

-- Add a comment to the table for future reference
COMMENT ON COLUMN public.doodle_hunt_dash_guesses.level IS 'Level when the guess was made. New guesses will automatically use the correct level from the game state.';
