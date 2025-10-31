-- Add word column to doodle_hunt_daily table
-- This migration adds a direct word column to store the word text instead of only having a reference

-- Add the word column
ALTER TABLE public.doodle_hunt_daily 
ADD COLUMN IF NOT EXISTS word TEXT;

-- Populate the word column with data from the words table for existing records
UPDATE public.doodle_hunt_daily 
SET word = w.word 
FROM public.words w 
WHERE public.doodle_hunt_daily.word_id = w.id 
AND public.doodle_hunt_daily.word IS NULL;

-- Create index on the new word column for performance
CREATE INDEX IF NOT EXISTS idx_doodle_hunt_daily_word ON public.doodle_hunt_daily(word);

-- Drop the old function before recreating with new return type
DROP FUNCTION IF EXISTS public.get_doodle_hunt_daily();

-- Update the get_doodle_hunt_daily function to return the word and category
CREATE OR REPLACE FUNCTION public.get_doodle_hunt_daily()
RETURNS TABLE(word TEXT, category TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  w_id UUID;
  word_text TEXT;
BEGIN
  -- If today's entry doesn't exist, create it with a random word
  IF NOT EXISTS (SELECT 1 FROM public.doodle_hunt_daily WHERE date = today) THEN
    w_id := public._get_random_word_id();
    IF w_id IS NULL THEN
      RAISE EXCEPTION 'No words available to select for doodle_hunt_daily';
    END IF;
    
    -- Get the word text from the words table
    SELECT w.word INTO word_text FROM public.words w WHERE w.id = w_id;
    
    INSERT INTO public.doodle_hunt_daily (word_id, word, date) VALUES (w_id, word_text, today);
  END IF;

  -- Return the word and category from the doodle_hunt_daily table joined with words
  RETURN QUERY
  SELECT dhd.word, w.category
  FROM public.doodle_hunt_daily dhd
  LEFT JOIN public.words w ON dhd.word_id = w.id
  WHERE dhd.date = today
  LIMIT 1;
END;
$$;

-- Update the set_doodle_hunt_daily function to also set the word column
CREATE OR REPLACE FUNCTION public.set_doodle_hunt_daily(word_text TEXT, target_date DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  w_id UUID;
  rec_id UUID;
BEGIN
  SELECT id INTO w_id FROM public.words WHERE word = word_text LIMIT 1;
  IF w_id IS NULL THEN
    INSERT INTO public.words(word) VALUES (word_text) RETURNING id INTO w_id;
  END IF;

  INSERT INTO public.doodle_hunt_daily (word_id, word, date)
  VALUES (w_id, word_text, target_date)
  ON CONFLICT (date) DO UPDATE SET 
    word_id = EXCLUDED.word_id,
    word = EXCLUDED.word
  RETURNING id INTO rec_id;

  RETURN rec_id;
END;
$$;

-- Update the cron_update_doodle_hunt_daily function to handle the word column
CREATE OR REPLACE FUNCTION public.cron_update_doodle_hunt_daily()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tomorrow_date DATE;
  random_word_id UUID;
  random_word_text TEXT;
BEGIN
  -- Get tomorrow's date
  tomorrow_date := CURRENT_DATE + INTERVAL '1 day';
  
  -- Get a random word for tomorrow
  random_word_id := public._get_random_word_id();
  IF random_word_id IS NULL THEN
    RAISE EXCEPTION 'No words available to select for doodle_hunt_daily';
  END IF;
  
  -- Get the word text
  SELECT word INTO random_word_text FROM public.words WHERE id = random_word_id;
  
  -- Set the word for tomorrow
  PERFORM public.set_doodle_hunt_daily(random_word_text, tomorrow_date);
  
  -- Also ensure today's word exists
  IF NOT EXISTS (
    SELECT 1 FROM public.doodle_hunt_daily 
    WHERE date = CURRENT_DATE
  ) THEN
    PERFORM public.set_doodle_hunt_daily(random_word_text, CURRENT_DATE);
  END IF;
  
  -- Log the action
  RAISE NOTICE 'Updated doodle hunt daily for %: %', tomorrow_date, random_word_text;
END;
$$;

-- Update the trigger_doodle_hunt_daily_update function to use the word column
CREATE OR REPLACE FUNCTION public.trigger_doodle_hunt_daily_update()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Call the cron function
  PERFORM public.cron_update_doodle_hunt_daily();
  
  -- Return current doodle hunt daily info using the word column
  SELECT json_build_object(
    'success', true,
    'message', 'Doodle hunt daily updated successfully',
    'current_word', dhd.word,
    'current_date', dhd.date
  ) INTO result
  FROM public.doodle_hunt_daily dhd
  WHERE dhd.date = CURRENT_DATE;
  
  RETURN result;
END;
$$;

-- Grant permissions on the updated functions
GRANT EXECUTE ON FUNCTION public.get_doodle_hunt_daily() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_doodle_hunt_daily(TEXT, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_update_doodle_hunt_daily() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_doodle_hunt_daily_update() TO service_role;
