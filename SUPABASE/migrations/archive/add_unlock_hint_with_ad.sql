-- Add function to unlock hint without spending tokens (for ad rewards)
-- This function allows unlocking hints when watching ads

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
  
  -- Unlock hint without spending token
  UPDATE public.guesses
  SET hint_used = TRUE
  WHERE id = guess_id AND game_id = game_uuid;
  
  RETURN TRUE;
END;
$$;
