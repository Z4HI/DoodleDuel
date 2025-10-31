-- Add streak tracking fields to profiles table
-- This migration adds the missing streak fields that are referenced in the code

-- Add streak tracking fields for Word of the Day
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS word_of_day_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_word_of_day_date DATE;

-- Add streak tracking fields for Doodle Hunt
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS doodle_hunt_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_doodle_hunt_date DATE;

-- Add constraints to ensure streak values are non-negative
ALTER TABLE public.profiles 
ADD CONSTRAINT word_of_day_streak_non_negative CHECK (word_of_day_streak >= 0),
ADD CONSTRAINT doodle_hunt_streak_non_negative CHECK (doodle_hunt_streak >= 0);

-- Create indexes for better query performance on streak fields
CREATE INDEX IF NOT EXISTS idx_profiles_word_of_day_streak ON public.profiles(word_of_day_streak);
CREATE INDEX IF NOT EXISTS idx_profiles_doodle_hunt_streak ON public.profiles(doodle_hunt_streak);
CREATE INDEX IF NOT EXISTS idx_profiles_last_word_of_day_date ON public.profiles(last_word_of_day_date);
CREATE INDEX IF NOT EXISTS idx_profiles_last_doodle_hunt_date ON public.profiles(last_doodle_hunt_date);

-- Add comments for documentation
COMMENT ON COLUMN public.profiles.word_of_day_streak IS 'Current streak count for Word of the Day game';
COMMENT ON COLUMN public.profiles.last_word_of_day_date IS 'Last date the user played Word of the Day';
COMMENT ON COLUMN public.profiles.doodle_hunt_streak IS 'Current streak count for Doodle Hunt game';
COMMENT ON COLUMN public.profiles.last_doodle_hunt_date IS 'Last date the user played Doodle Hunt';
