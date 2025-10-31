-- Add hint column back to guesses table
-- This migration adds the hint column that was removed

-- Add hint column to guesses table
ALTER TABLE public.guesses 
ADD COLUMN IF NOT EXISTS hint TEXT;
