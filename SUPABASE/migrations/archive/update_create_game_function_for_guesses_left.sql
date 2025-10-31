-- Update the create_doodle_hunt_game function to initialize guesses_left
-- This ensures new games start with guesses_left = 5

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
