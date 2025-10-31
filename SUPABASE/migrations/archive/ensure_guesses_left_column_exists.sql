-- Ensure guesses_left column exists in doodle_hunt_solo table
-- This migration adds the column if it doesn't exist and sets default values

-- Add the guesses_left column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'doodle_hunt_solo' 
        AND column_name = 'guesses_left'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.doodle_hunt_solo 
        ADD COLUMN guesses_left INTEGER DEFAULT 5 CHECK (guesses_left >= 0);
        
        -- Update existing records to have guesses_left = 5
        UPDATE public.doodle_hunt_solo 
        SET guesses_left = 5 
        WHERE guesses_left IS NULL;
        
        RAISE NOTICE 'Added guesses_left column to doodle_hunt_solo table';
    ELSE
        RAISE NOTICE 'guesses_left column already exists in doodle_hunt_solo table';
    END IF;
END $$;
