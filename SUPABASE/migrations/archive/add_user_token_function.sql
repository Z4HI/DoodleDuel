-- Add function to add tokens to user's profile
CREATE OR REPLACE FUNCTION public.add_user_token(token_amount INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Add tokens to the current user's profile
  UPDATE public.profiles
  SET game_tokens = COALESCE(game_tokens, 0) + token_amount
  WHERE id = auth.uid();
  
  -- Check if the update affected any rows
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;
END;
$$;
