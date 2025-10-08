-- Add guesses column that increments by 1 after each guess
-- This column tracks the total number of guesses made (can exceed 5)
-- while guesses_left tracks remaining guesses (5 to 0)

-- Add the guesses column with default value of 0
-- No upper limit since users can watch ads to continue guessing
ALTER TABLE public.doodle_hunt_solo 
ADD COLUMN IF NOT EXISTS guesses INTEGER DEFAULT 0 CHECK (guesses >= 0);

-- Update existing records to have guesses = 0
UPDATE public.doodle_hunt_solo 
SET guesses = 0 
WHERE guesses IS NULL;

-- Update the create_doodle_hunt_game function to initialize both columns
CREATE OR REPLACE FUNCTION public.create_doodle_hunt_game(
  target_word_text TEXT,
  word_category TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  game_id UUID;
  user_uuid UUID;
BEGIN
  -- Get current user
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to create a game';
  END IF;
  
  -- Check if user has an active game
  IF EXISTS (
    SELECT 1 FROM public.doodle_hunt_solo 
    WHERE user_id = user_uuid AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'User already has an active DoodleHunt game';
  END IF;
  
  -- Create the game with both guesses and guesses_left initialized
  INSERT INTO public.doodle_hunt_solo (user_id, target_word, status, guesses, guesses_left, category)
  VALUES (user_uuid, target_word_text, 'in_progress', 0, 5, word_category)
  RETURNING id INTO game_id;
  
  RETURN game_id;
END;
$$;

-- Update the add_doodle_hunt_guess function to increment guesses and decrement guesses_left
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
  
  -- Check if user has guesses left
  IF current_guesses_left IS NOT NULL AND current_guesses_left <= 0 THEN
    RAISE EXCEPTION 'No guesses left for this game';
  END IF;
  
  -- Add the guess
  INSERT INTO public.guesses (game_id, guess_number, target_word, ai_guess_word, similarity_score)
  VALUES (game_uuid, guess_num, target_word_text, ai_guess_text, similarity_num)
  RETURNING id INTO guess_id;
  
  -- Update game final score, increment guesses, and decrement guesses_left
  UPDATE public.doodle_hunt_solo 
  SET final_score = GREATEST(final_score, similarity_num),
      guesses = CASE 
        WHEN guesses IS NOT NULL THEN guesses + 1 
        ELSE 1 
      END,
      guesses_left = CASE 
        WHEN guesses_left IS NOT NULL THEN guesses_left - 1 
        ELSE NULL 
      END,
      updated_at = NOW()
  WHERE id = game_uuid;
  
  RETURN guess_id;
END;
$$;

-- Update the reset function to only reset guesses_left, keep guesses count
CREATE OR REPLACE FUNCTION public.reset_doodle_hunt_guesses_left(
  game_uuid UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid UUID;
BEGIN
  -- Get current user
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to reset guesses';
  END IF;
  
  -- Reset only guesses_left to 5, keep guesses count to track total attempts
  UPDATE public.doodle_hunt_solo 
  SET guesses_left = 5,
      updated_at = NOW()
  WHERE id = game_uuid AND user_id = user_uuid AND status = 'in_progress';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found, not authorized, or not in progress';
  END IF;
END;
$$;
