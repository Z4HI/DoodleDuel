-- ============================================================================
-- HINT SYSTEM - Complete Setup
-- ============================================================================
-- This migration sets up the complete hint system for Doodle Hunt games
-- Replaces: add_hint_to_guesses.sql, add_hint_used_column.sql, 
--           add_hint_column_back.sql, remove_hint_column.sql,
--           add_unlock_hint_with_ad.sql, add_dash_hint_unlock_function.sql
-- 
-- Final state: 
-- - guesses table has hint and hint_used columns
-- - doodle_hunt_dash_guesses table has hint and hint_used columns  
-- - Functions to unlock hints with tokens or ads
-- ============================================================================

-- ============================================================================
-- STEP 1: Add hint columns to tables
-- ============================================================================

-- Add hint columns to regular guesses table
ALTER TABLE public.guesses 
ADD COLUMN IF NOT EXISTS hint TEXT,
ADD COLUMN IF NOT EXISTS hint_used BOOLEAN DEFAULT FALSE;

-- Add hint columns to dash guesses table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doodle_hunt_dash_guesses') THEN
        ALTER TABLE public.doodle_hunt_dash_guesses 
        ADD COLUMN IF NOT EXISTS hint TEXT,
        ADD COLUMN IF NOT EXISTS hint_used BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Unlock hint functions for regular Doodle Hunt
-- ============================================================================

-- Function to unlock hint using game tokens
CREATE OR REPLACE FUNCTION public.unlock_hint_with_token(
  game_uuid UUID,
  guess_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid UUID;
  game_status TEXT;
  current_tokens INTEGER;
  current_hint_used BOOLEAN;
BEGIN
  -- Get current user
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to unlock hint';
  END IF;
  
  -- Verify the game belongs to the user and is active
  SELECT status INTO game_status
  FROM public.doodle_hunt_solo 
  WHERE id = game_uuid AND user_id = user_uuid;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found or not authorized';
  END IF;
  
  IF game_status != 'in_progress' THEN
    RAISE EXCEPTION 'Game is not in progress';
  END IF;
  
  -- Check if hint is already used
  SELECT hint_used INTO current_hint_used
  FROM public.guesses
  WHERE id = guess_id AND game_id = game_uuid;
  
  IF current_hint_used THEN
    RAISE EXCEPTION 'Hint already unlocked for this guess';
  END IF;
  
  -- Get current tokens
  SELECT game_tokens INTO current_tokens
  FROM public.profiles
  WHERE id = user_uuid;
  
  IF current_tokens IS NULL OR current_tokens < 2 THEN
    RAISE EXCEPTION 'Insufficient tokens to unlock hint';
  END IF;
  
  -- Deduct tokens and unlock hint
  UPDATE public.profiles
  SET game_tokens = game_tokens - 2
  WHERE id = user_uuid;
  
  UPDATE public.guesses
  SET hint_used = TRUE
  WHERE id = guess_id AND game_id = game_uuid;
  
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_hint_with_token(UUID, UUID) TO authenticated;

-- Function to unlock hint by watching an ad (free)
CREATE OR REPLACE FUNCTION public.unlock_hint_with_ad(
  game_uuid UUID,
  guess_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid UUID;
  game_status TEXT;
  current_hint_used BOOLEAN;
BEGIN
  -- Get current user
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to unlock hint';
  END IF;
  
  -- Verify the game belongs to the user and is active
  SELECT status INTO game_status
  FROM public.doodle_hunt_solo 
  WHERE id = game_uuid AND user_id = user_uuid;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found or not authorized';
  END IF;
  
  IF game_status != 'in_progress' THEN
    RAISE EXCEPTION 'Game is not in progress';
  END IF;
  
  -- Check if hint is already used
  SELECT hint_used INTO current_hint_used
  FROM public.guesses
  WHERE id = guess_id AND game_id = game_uuid;
  
  IF current_hint_used THEN
    RAISE EXCEPTION 'Hint already unlocked for this guess';
  END IF;
  
  -- Unlock hint without spending tokens
  UPDATE public.guesses
  SET hint_used = TRUE
  WHERE id = guess_id AND game_id = game_uuid;
  
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_hint_with_ad(UUID, UUID) TO authenticated;

-- ============================================================================
-- STEP 3: Unlock hint function for Dash games
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unlock_dash_hint_with_token(
  game_uuid UUID,
  guess_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid UUID;
  current_game RECORD;
  guess_record RECORD;
  current_tokens INTEGER;
  current_hint_used BOOLEAN;
  hint_text TEXT;
BEGIN
  -- Get current user
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to unlock hint';
  END IF;

  -- Verify the game exists and belongs to the current user
  SELECT * INTO current_game
  FROM public.doodle_hunt_dash_games
  WHERE id = game_uuid
    AND user_id = user_uuid
    AND status = 'in_progress';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found or not authorized';
  END IF;
  
  -- Get the guess record
  SELECT * INTO guess_record
  FROM public.doodle_hunt_dash_guesses
  WHERE id = guess_id
    AND game_id = game_uuid;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guess not found';
  END IF;
  
  -- Check if hint is already used
  current_hint_used := guess_record.hint_used;
  
  IF current_hint_used THEN
    RAISE EXCEPTION 'Hint already unlocked for this guess';
  END IF;
  
  -- Get current tokens
  SELECT game_tokens INTO current_tokens
  FROM public.profiles
  WHERE id = user_uuid;
  
  IF current_tokens IS NULL OR current_tokens < 2 THEN
    RAISE EXCEPTION 'Insufficient tokens to unlock hint';
  END IF;
  
  -- Deduct tokens
  UPDATE public.profiles
  SET game_tokens = game_tokens - 2
  WHERE id = user_uuid;
  
  -- Use the existing hint from the guess record (generated by AI)
  hint_text := guess_record.hint;
  
  -- Update the guess to mark hint as used
  UPDATE public.doodle_hunt_dash_guesses
  SET 
    hint_used = TRUE,
    updated_at = NOW()
  WHERE id = guess_id;
  
  -- Return the hint
  RETURN json_build_object(
    'hint', hint_text,
    'success', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_dash_hint_with_token(UUID, UUID) TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================

SELECT 'Hint system complete!' AS result;

