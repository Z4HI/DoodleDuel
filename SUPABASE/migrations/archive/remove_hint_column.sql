-- Remove hint column from guesses table and update the add_doodle_hunt_guess function
-- This migration removes the hint functionality from the doodle hunt game

-- Remove hint column from guesses table
ALTER TABLE public.guesses 
DROP COLUMN IF EXISTS hint;

-- Update the add_doodle_hunt_guess function to remove hint parameter
CREATE OR REPLACE FUNCTION public.add_doodle_hunt_guess(
  game_uuid UUID,
  guess_num INTEGER,
  target_word_text TEXT,
  ai_guess_text TEXT,
  similarity_num INTEGER
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
  
  -- Add the guess without hint
  INSERT INTO public.guesses (game_id, guess_number, target_word, ai_guess_word, similarity_score)
  VALUES (game_uuid, guess_num, target_word_text, ai_guess_text, similarity_num)
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
