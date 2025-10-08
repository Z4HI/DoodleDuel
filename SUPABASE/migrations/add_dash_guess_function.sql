-- Add guess function for doodle hunt dash games
-- This function adds a guess to a dash game and updates the game stats

CREATE OR REPLACE FUNCTION public.add_dash_game_guess(
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
  current_game RECORD;
  level_guess_count INTEGER;
  calculated_guess_num INTEGER;
BEGIN
  -- Verify the game exists and belongs to the current user
  SELECT * INTO current_game
  FROM public.doodle_hunt_dash_games
  WHERE id = game_uuid
    AND user_id = auth.uid()
    AND status = 'in_progress';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found or not authorized';
  END IF;
  
  -- Count existing guesses for this level
  SELECT COUNT(*) INTO level_guess_count
  FROM public.doodle_hunt_dash_guesses
  WHERE game_id = game_uuid AND level = current_game.current_level;
  
  -- Calculate the guess number for this level
  calculated_guess_num := level_guess_count + 1;
  
  -- Debug: Log the level being used
  RAISE NOTICE 'Adding guess for game %, level %, guess number %', game_uuid, current_game.current_level, calculated_guess_num;
  
  -- Insert the guess into dash guesses table
  INSERT INTO public.doodle_hunt_dash_guesses (
    game_id,
    level,
    guess_number,
    target_word,
    ai_guess_word,
    similarity_score,
    hint,
    hint_used
  ) VALUES (
    game_uuid,
    current_game.current_level,
    calculated_guess_num,
    target_word_text,
    ai_guess_text,
    similarity_num,
    hint_text,
    FALSE
  ) RETURNING id INTO guess_id;
  
  -- Update the dash game stats
  UPDATE public.doodle_hunt_dash_games
  SET 
    total_attempts = total_attempts + 1,
    best_score = GREATEST(best_score, similarity_num),
    guesses_left = GREATEST(0, guesses_left - 1),
    updated_at = NOW()
  WHERE id = game_uuid;
  
  RETURN guess_id;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.add_dash_game_guess(UUID, INTEGER, TEXT, TEXT, INTEGER, TEXT) TO authenticated;
