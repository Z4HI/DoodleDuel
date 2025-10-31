-- Add category column to doodle_hunt_duel table
-- This allows us to store and retrieve the category along with the duel game data

-- Add the category column
ALTER TABLE public.doodle_hunt_duel 
ADD COLUMN IF NOT EXISTS category TEXT;

-- Populate existing records with category from words table
UPDATE public.doodle_hunt_duel 
SET category = w.category 
FROM public.words w 
WHERE public.doodle_hunt_duel.target_word = w.word 
AND public.doodle_hunt_duel.category IS NULL;

-- Create index on the category column for potential future queries
CREATE INDEX IF NOT EXISTS idx_doodle_hunt_duel_category ON public.doodle_hunt_duel(category);

-- Update the create_doodle_hunt_duel_game function to accept and store category
DROP FUNCTION IF EXISTS public.create_doodle_hunt_duel_game(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.create_doodle_hunt_duel_game(
  duel_uuid UUID,
  user_uuid UUID,
  target_word_text TEXT,
  word_category TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_game_id UUID;
  word_cat TEXT;
BEGIN
  -- If category is not provided or empty, fetch it from words table
  IF word_category IS NULL OR word_category = '' THEN
    SELECT category INTO word_cat
    FROM public.words
    WHERE word = target_word_text
    LIMIT 1;
  ELSE
    word_cat := word_category;
  END IF;

  -- Check if game already exists for this user and duel
  SELECT id INTO new_game_id
  FROM public.doodle_hunt_duel
  WHERE doodle_hunt_duel.duel_id = duel_uuid
    AND doodle_hunt_duel.user_id = user_uuid
  LIMIT 1;

  IF new_game_id IS NOT NULL THEN
    -- Return existing game
    RETURN new_game_id;
  END IF;

  -- Create new game
  INSERT INTO public.doodle_hunt_duel (
    duel_id,
    user_id,
    target_word,
    category,
    status,
    guesses,
    created_at
  ) VALUES (
    duel_uuid,
    user_uuid,
    target_word_text,
    word_cat,
    'in_progress',
    0,
    NOW()
  )
  RETURNING id INTO new_game_id;

  RETURN new_game_id;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.create_doodle_hunt_duel_game(UUID, UUID, TEXT, TEXT) TO authenticated;

