-- Add position column to all guess/turn tables
-- Position represents the rank/position of the word guess (like Contexto game)

-- 1. Add position to doodle_hunt_dash_guesses
ALTER TABLE public.doodle_hunt_dash_guesses 
ADD COLUMN IF NOT EXISTS position INTEGER;

COMMENT ON COLUMN public.doodle_hunt_dash_guesses.position IS 'Position/rank of the guess word (like Contexto). Lower is better (1 = perfect match).';

-- 2. Add position to doodle_hunt_duel_guesses
ALTER TABLE public.doodle_hunt_duel_guesses 
ADD COLUMN IF NOT EXISTS position INTEGER;

COMMENT ON COLUMN public.doodle_hunt_duel_guesses.position IS 'Position/rank of the guess word (like Contexto). Lower is better (1 = perfect match).';

-- 3. Add position to doodle_hunt_friend_turns
ALTER TABLE public.doodle_hunt_friend_turns 
ADD COLUMN IF NOT EXISTS position INTEGER;

COMMENT ON COLUMN public.doodle_hunt_friend_turns.position IS 'Position/rank of the guess word (like Contexto). Lower is better (1 = perfect match).';

-- 4. Add position to guesses (main solo guesses table)
ALTER TABLE public.guesses 
ADD COLUMN IF NOT EXISTS position INTEGER;

COMMENT ON COLUMN public.guesses.position IS 'Position/rank of the guess word (like Contexto). Lower is better (1 = perfect match).';

-- 5. Add position to roulette_turns
ALTER TABLE public.roulette_turns 
ADD COLUMN IF NOT EXISTS position INTEGER;

COMMENT ON COLUMN public.roulette_turns.position IS 'Position/rank of the guess word (like Contexto). Lower is better (1 = perfect match).';

-- Create indexes for position columns to improve query performance
CREATE INDEX IF NOT EXISTS idx_dash_guesses_position ON public.doodle_hunt_dash_guesses(position);
CREATE INDEX IF NOT EXISTS idx_duel_guesses_position ON public.doodle_hunt_duel_guesses(position);
CREATE INDEX IF NOT EXISTS idx_friend_turns_position ON public.doodle_hunt_friend_turns(position);
CREATE INDEX IF NOT EXISTS idx_guesses_position ON public.guesses(position);
CREATE INDEX IF NOT EXISTS idx_roulette_turns_position ON public.roulette_turns(position);

-- ============================================================================
-- Update RPC functions to accept and store position
-- ============================================================================

-- 1. Update submit_roulette_turn to accept and store position
-- Note: This replaces the existing function, preserving all existing logic
DROP FUNCTION IF EXISTS public.submit_roulette_turn(UUID, TEXT, JSONB, TEXT, INTEGER, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.submit_roulette_turn(
    target_match_id UUID,
    svg_url TEXT,
    paths_json JSONB,
    ai_guess_text TEXT,
    similarity_num INTEGER,
    calling_user_id UUID DEFAULT NULL,
    position_num INTEGER DEFAULT NULL
)
RETURNS UUID 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
    v_turn_id UUID;
    v_current_user UUID;
    v_expected_user TEXT;
    v_turn_number INTEGER;
    v_duration INTEGER;
    v_was_correct BOOLEAN;
BEGIN
    -- Use parameter if provided, otherwise fall back to auth.uid()
    v_current_user := COALESCE(calling_user_id, auth.uid());
    
    IF v_current_user IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Get current turn information
    SELECT 
        turn_order[current_turn_index + 1],
        turn_number,
        EXTRACT(EPOCH FROM (NOW() - turn_start_time))::INTEGER
    INTO v_expected_user, v_turn_number, v_duration
    FROM roulette_matches
    WHERE id = target_match_id;

    -- Verify it's this user's turn
    IF v_expected_user != v_current_user::TEXT THEN
        RAISE EXCEPTION 'Not your turn. Expected: %, Got: %', v_expected_user, v_current_user::TEXT;
    END IF;

    -- Check if guess was correct (100% similarity or higher)
    v_was_correct := similarity_num >= 100;

    -- Insert turn record with position
    INSERT INTO roulette_turns (
        match_id,
        user_id,
        turn_number,
        drawing_paths,
        svg_url,
        ai_guess,
        similarity_score,
        was_correct,
        duration_seconds,
        position
    )
    VALUES (
        target_match_id,
        v_current_user,
        v_turn_number,
        paths_json,
        svg_url,
        ai_guess_text,
        similarity_num,
        v_was_correct,
        v_duration,
        position_num
    )
    RETURNING id INTO v_turn_id;
    
    -- Delete stroke data for this turn (no longer needed)
    DELETE FROM roulette_drawing_strokes
    WHERE match_id = target_match_id
    AND turn_number = v_turn_number;
    
    -- Advance to next turn if game isn't over
    IF NOT v_was_correct THEN
        UPDATE roulette_matches
        SET 
            current_turn_index = (current_turn_index + 1) % array_length(turn_order, 1),
            turn_number = turn_number + 1,
            turn_start_time = NOW()
        WHERE id = target_match_id;
    END IF;
    
    RETURN v_turn_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_roulette_turn(UUID, TEXT, JSONB, TEXT, INTEGER, UUID, INTEGER) TO authenticated;

-- 2. Update submit_doodle_hunt_friend_turn to accept and store position
-- Note: This replaces the existing function, preserving all existing logic including turn advancement
DROP FUNCTION IF EXISTS submit_doodle_hunt_friend_turn(UUID, TEXT, JSONB, TEXT, INTEGER, UUID) CASCADE;

CREATE OR REPLACE FUNCTION submit_doodle_hunt_friend_turn(
    target_duel_id UUID,
    svg_url TEXT,
    paths_json JSONB,
    ai_guess_text TEXT,
    similarity_num INTEGER,
    calling_user_id UUID DEFAULT NULL,
    position_num INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_turn_id UUID;
    v_current_user UUID;
    v_expected_user TEXT;
    v_turn_number INTEGER;
    v_duration INTEGER;
    v_was_correct BOOLEAN;
BEGIN
    -- Use parameter if provided, otherwise fall back to auth.uid()
    v_current_user := COALESCE(calling_user_id, auth.uid());
    
    IF v_current_user IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Get current turn information
    SELECT 
        turn_order[current_turn_index + 1],
        roulette_turn_number,
        EXTRACT(EPOCH FROM (NOW() - turn_start_time))::INTEGER
    INTO v_expected_user, v_turn_number, v_duration
    FROM duels
    WHERE id = target_duel_id;
    
    -- Verify it's this user's turn
    IF v_expected_user != v_current_user::TEXT THEN
        RAISE EXCEPTION 'Not your turn. Expected: %, Got: %', v_expected_user, v_current_user::TEXT;
    END IF;
    
    -- Check if guess was correct (100% = win)
    v_was_correct := similarity_num >= 100;
    
    -- Insert turn record with position
    INSERT INTO doodle_hunt_friend_turns (
        duel_id,
        user_id,
        turn_number,
        drawing_paths,
        svg_url,
        ai_guess,
        similarity_score,
        was_correct,
        duration_seconds,
        position
    )
    VALUES (
        target_duel_id,
        v_current_user,
        v_turn_number,
        paths_json,
        svg_url,
        ai_guess_text,
        similarity_num,
        v_was_correct,
        v_duration,
        position_num
    )
    RETURNING id INTO v_turn_id;
    
    -- Delete stroke data for this turn (no longer needed)
    DELETE FROM doodle_hunt_friend_strokes
    WHERE duel_id = target_duel_id
    AND turn_number = v_turn_number;
    
    -- Advance turn if not correct (turn advancement logic is in advance_doodle_hunt_friend_turn function)
    IF NOT v_was_correct THEN
        PERFORM advance_doodle_hunt_friend_turn(target_duel_id);
    END IF;
    
    RETURN v_turn_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update add_dash_game_guess to accept and store position
DROP FUNCTION IF EXISTS public.add_dash_game_guess(UUID, INTEGER, TEXT, TEXT, INTEGER, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION public.add_dash_game_guess(
  game_uuid UUID,
  guess_num INTEGER,
  target_word_text TEXT,
  ai_guess_text TEXT,
  similarity_num INTEGER,
  hint_text TEXT DEFAULT NULL,
  position_num INTEGER DEFAULT NULL
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
  
  -- Insert the guess into dash guesses table with position
  INSERT INTO public.doodle_hunt_dash_guesses (
    game_id,
    level,
    guess_number,
    target_word,
    ai_guess_word,
    similarity_score,
    hint,
    hint_used,
    position
  ) VALUES (
    game_uuid,
    current_game.current_level,
    calculated_guess_num,
    target_word_text,
    ai_guess_text,
    similarity_num,
    hint_text,
    FALSE,
    position_num
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

GRANT EXECUTE ON FUNCTION public.add_dash_game_guess(UUID, INTEGER, TEXT, TEXT, INTEGER, TEXT, INTEGER) TO authenticated;

-- 4. Update add_doodle_hunt_guess (solo mode) to accept and store position
-- First check if this function exists and get its current signature
DROP FUNCTION IF EXISTS public.add_doodle_hunt_guess(UUID, INTEGER, TEXT, TEXT, INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION public.add_doodle_hunt_guess(
  game_uuid UUID,
  guess_num INTEGER,
  target_word_text TEXT,
  ai_guess_text TEXT,
  similarity_num INTEGER,
  position_num INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  guess_id UUID;
  user_uuid UUID;
  game_status TEXT;
BEGIN
  -- Get current user
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to add a guess';
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
  
  -- Add the guess with position
  INSERT INTO public.guesses (game_id, guess_number, target_word, ai_guess_word, similarity_score, position)
  VALUES (game_uuid, guess_num, target_word_text, ai_guess_text, similarity_num, position_num)
  RETURNING id INTO guess_id;
  
  -- Update game final score if this is the best guess so far
  UPDATE public.doodle_hunt_solo 
  SET final_score = GREATEST(final_score, similarity_num),
      updated_at = NOW()
  WHERE id = game_uuid;
  
  RETURN guess_id;
END;
$$;

-- 5. Update add_doodle_hunt_duel_guess to accept and store position
DROP FUNCTION IF EXISTS add_doodle_hunt_duel_guess(UUID, INTEGER, TEXT, TEXT, INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION add_doodle_hunt_duel_guess(
    game_uuid UUID,
    guess_num INTEGER,
    target_word_text TEXT,
    ai_guess_text TEXT,
    similarity_num INTEGER,
    position_num INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    guess_uuid UUID;
    user_uuid UUID;
BEGIN
    -- Current user
    user_uuid := auth.uid();
    IF user_uuid IS NULL THEN
      RAISE EXCEPTION 'User must be authenticated to add a guess';
    END IF;

    -- Verify the game belongs to the current user
    IF NOT EXISTS (
      SELECT 1 FROM doodle_hunt_duel WHERE id = game_uuid AND user_id = user_uuid
    ) THEN
      RAISE EXCEPTION 'Game not found or not authorized';
    END IF;

    -- Add guess to duel guesses table with position
    INSERT INTO doodle_hunt_duel_guesses (game_id, user_id, guess_number, target_word, ai_guess_word, similarity_score, position)
    VALUES (game_uuid, user_uuid, guess_num, target_word_text, ai_guess_text, similarity_num, position_num)
    RETURNING id INTO guess_uuid;
    
    -- Update guesses count in doodle_hunt_duel
    UPDATE doodle_hunt_duel 
    SET guesses = guess_num, updated_at = NOW()
    WHERE id = game_uuid;
    
    RETURN guess_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

