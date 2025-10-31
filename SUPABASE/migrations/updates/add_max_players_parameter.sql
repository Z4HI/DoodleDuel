-- Add max_players parameter to find_or_create_match function
-- This allows creating matches with different player counts (2-player, 4-player, etc.)

CREATE OR REPLACE FUNCTION public.find_or_create_match(
  match_type TEXT DEFAULT 'multiplayer',
  difficulty_level TEXT DEFAULT 'easy',
  max_players_count INTEGER DEFAULT 2
)
RETURNS TABLE (
  match_id UUID,
  word TEXT,
  is_new_match BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_match RECORD;
  random_word TEXT;
  new_match_id UUID;
BEGIN
  -- Validate max_players_count (must be between 2 and 10)
  IF max_players_count < 2 OR max_players_count > 10 THEN
    RAISE EXCEPTION 'max_players must be between 2 and 10';
  END IF;

  -- First, try to find an existing waiting match with the SAME max_players count
  SELECT m.id, m.word INTO existing_match
  FROM public.matches m
  WHERE m.status = 'waiting' 
    AND m.type = match_type
    AND m.difficulty = difficulty_level
    AND m.max_players = max_players_count  -- Match must have same player limit
    AND (
      SELECT COUNT(*) 
      FROM public.match_participants mp 
      WHERE mp.match_id = m.id
    ) < m.max_players
  ORDER BY m.created_at ASC
  LIMIT 1;
  
  IF FOUND THEN
    -- Found an existing match with same settings, return it
    RETURN QUERY SELECT existing_match.id, existing_match.word, FALSE;
  ELSE
    -- No existing match found, create a new one
    -- Get a random word for the match
    SELECT w.word INTO random_word
    FROM public.words w
    WHERE w.difficulty = difficulty_level
    ORDER BY RANDOM()
    LIMIT 1;
    
    IF random_word IS NULL THEN
      RAISE EXCEPTION 'No words found for difficulty level: %', difficulty_level;
    END IF;
    
    -- Create the new match with specified max_players
    INSERT INTO public.matches (type, word, difficulty, status, max_players)
    VALUES (match_type, random_word, difficulty_level, 'waiting', max_players_count)
    RETURNING id INTO new_match_id;
    
    -- Automatically add the current user to the new match
    INSERT INTO public.match_participants (match_id, user_id)
    VALUES (new_match_id, auth.uid());
    
    RETURN QUERY SELECT new_match_id, random_word, TRUE;
  END IF;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.find_or_create_match(TEXT, TEXT, INTEGER) TO authenticated;

