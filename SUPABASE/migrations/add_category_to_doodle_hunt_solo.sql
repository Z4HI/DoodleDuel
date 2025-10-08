-- Add category column to doodle_hunt_solo table
-- This allows us to store and retrieve the category along with the game data

-- Add the category column
ALTER TABLE public.doodle_hunt_solo 
ADD COLUMN IF NOT EXISTS category TEXT;

-- Populate existing records with category from words table
UPDATE public.doodle_hunt_solo 
SET category = w.category 
FROM public.words w 
WHERE public.doodle_hunt_solo.target_word = w.word 
AND public.doodle_hunt_solo.category IS NULL;

-- Create index on the category column for potential future queries
CREATE INDEX IF NOT EXISTS idx_doodle_hunt_solo_category ON public.doodle_hunt_solo(category);

-- Update the create_doodle_hunt_game function to accept and store category
DROP FUNCTION IF EXISTS public.create_doodle_hunt_game(TEXT);

CREATE OR REPLACE FUNCTION public.create_doodle_hunt_game(
  target_word_text TEXT,
  word_category TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_game_id UUID;
  current_user_id UUID;
  word_cat TEXT;
BEGIN
  -- Get the current user
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- If category is not provided or empty, fetch it from words table
  IF word_category IS NULL OR word_category = '' THEN
    SELECT category INTO word_cat
    FROM public.words
    WHERE word = target_word_text
    LIMIT 1;
  ELSE
    word_cat := word_category;
  END IF;

  -- Check if there's already an active game for this user
  SELECT id INTO new_game_id
  FROM public.doodle_hunt_solo
  WHERE doodle_hunt_solo.user_id = current_user_id
    AND status = 'in_progress'
  LIMIT 1;

  IF new_game_id IS NOT NULL THEN
    -- Return existing active game
    RETURN new_game_id;
  END IF;

  -- Create new game
  INSERT INTO public.doodle_hunt_solo (
    user_id,
    target_word,
    category,
    status,
    created_at
  ) VALUES (
    current_user_id,
    target_word_text,
    word_cat,
    'in_progress',
    NOW()
  )
  RETURNING id INTO new_game_id;

  RETURN new_game_id;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.create_doodle_hunt_game(TEXT, TEXT) TO authenticated;

