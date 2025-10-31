-- Add hint_used column to guesses table and update functions
-- This migration adds hint functionality with token-based unlocking

-- Add hint_used column to guesses table (default false)
ALTER TABLE public.guesses 
ADD COLUMN IF NOT EXISTS hint_used BOOLEAN DEFAULT FALSE;

-- Update the add_doodle_hunt_guess function to include hint and hint_used
CREATE OR REPLACE FUNCTION public.add_doodle_hunt_guess(
  game_uuid UUID,
  guess_num INTEGER,
  target_word_text TEXT,
  ai_guess_text TEXT,
  similarity_num INTEGER,
  hint_text TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  guess_id UUID;
  user_uuid UUID;
  game_status TEXT;
  current_guesses_left INTEGER;
BEGIN
  -- Get current user
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to add a guess';
  END IF;
  
  -- Verify the game belongs to the user and is active, and get current guesses_left
  SELECT status, guesses_left INTO game_status, current_guesses_left
  FROM public.doodle_hunt_solo 
  WHERE id = game_uuid AND user_id = user_uuid;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found or not authorized';
  END IF;
  
  IF game_status != 'in_progress' THEN
    RAISE EXCEPTION 'Game is not in progress';
  END IF;
  
  -- Check if user has guesses left (only if guesses_left column exists)
  IF current_guesses_left IS NOT NULL AND current_guesses_left <= 0 THEN
    RAISE EXCEPTION 'No guesses left for this game';
  END IF;
  
  -- Add the guess with hint (hint_used defaults to false)
  INSERT INTO public.guesses (game_id, guess_number, target_word, ai_guess_word, similarity_score, hint, hint_used)
  VALUES (game_uuid, guess_num, target_word_text, ai_guess_text, similarity_num, hint_text, FALSE)
  RETURNING id INTO guess_id;
  
  -- Update game final score and decrement guesses_left (if column exists)
  UPDATE public.doodle_hunt_solo 
  SET final_score = GREATEST(final_score, similarity_num),
      guesses_left = CASE 
        WHEN guesses_left IS NOT NULL THEN guesses_left - 1 
        ELSE NULL 
      END,
      updated_at = NOW()
  WHERE id = game_uuid;
  
  RETURN guess_id;
END;
$$;

-- Function to unlock hint using a token
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
