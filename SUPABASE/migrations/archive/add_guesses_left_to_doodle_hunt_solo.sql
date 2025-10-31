-- Add guesses_left field to doodle_hunt_solo table
-- This field tracks remaining guesses for each game

-- Add the guesses_left column with default value of 5
ALTER TABLE public.doodle_hunt_solo 
ADD COLUMN IF NOT EXISTS guesses_left INTEGER DEFAULT 5 CHECK (guesses_left >= 0);

-- Update existing records to have guesses_left = 5
UPDATE public.doodle_hunt_solo 
SET guesses_left = 5 
WHERE guesses_left IS NULL;

-- Update the create_doodle_hunt_game function to initialize guesses_left
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
  
  -- Create the game with guesses_left initialized to 5
  INSERT INTO public.doodle_hunt_solo (user_id, target_word, status, guesses_left, category)
  VALUES (user_uuid, target_word_text, 'in_progress', 5, word_category)
  RETURNING id INTO game_id;
  
  RETURN game_id;
END;
$$;

-- Update the add_doodle_hunt_guess function to decrement guesses_left
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
  
  -- Verify the game belongs to the user and is active
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
  IF current_guesses_left <= 0 THEN
    RAISE EXCEPTION 'No guesses left for this game';
  END IF;
  
  -- Add the guess
  INSERT INTO public.guesses (game_id, guess_number, target_word, ai_guess_word, similarity_score)
  VALUES (game_uuid, guess_num, target_word_text, ai_guess_text, similarity_num)
  RETURNING id INTO guess_id;
  
  -- Update game final score and decrement guesses_left
  UPDATE public.doodle_hunt_solo 
  SET final_score = GREATEST(final_score, similarity_num),
      guesses_left = guesses_left - 1,
      updated_at = NOW()
  WHERE id = game_uuid;
  
  RETURN guess_id;
END;
$$;

-- Add function to reset guesses_left (for when user watches ad to continue)
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
  
  -- Reset guesses_left to 5 for the user's active game
  UPDATE public.doodle_hunt_solo 
  SET guesses_left = 5,
      updated_at = NOW()
  WHERE id = game_uuid AND user_id = user_uuid AND status = 'in_progress';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found, not authorized, or not in progress';
  END IF;
END;
$$;
