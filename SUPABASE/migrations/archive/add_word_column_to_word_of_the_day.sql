-- Add word column to word_of_the_day table
-- This migration adds a direct word column to store the word text instead of only having a reference

-- Add the word column
ALTER TABLE public.word_of_the_day 
ADD COLUMN IF NOT EXISTS word TEXT;

-- Populate the word column with data from the words table for existing records
UPDATE public.word_of_the_day 
SET word = w.word 
FROM public.words w 
WHERE public.word_of_the_day.word_id = w.id 
AND public.word_of_the_day.word IS NULL;

-- Create index on the new word column for performance
CREATE INDEX IF NOT EXISTS idx_word_of_the_day_word ON public.word_of_the_day(word);

-- Update the get_word_of_the_day function to return the word directly from the table
CREATE OR REPLACE FUNCTION public.get_word_of_the_day()
RETURNS TABLE (
  id UUID,
  word TEXT,
  difficulty TEXT,
  category TEXT,
  date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wotd.id,
    wotd.word,  -- Now using the word column directly from word_of_the_day
    w.difficulty,
    w.category,
    wotd.date
  FROM public.word_of_the_day wotd
  LEFT JOIN public.words w ON wotd.word_id = w.id
  WHERE wotd.date = CURRENT_DATE;
END;
$$;

-- Update the set_word_of_the_day function to also set the word column
CREATE OR REPLACE FUNCTION public.set_word_of_the_day(
  target_word TEXT,
  target_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  word_record RECORD;
  wotd_id UUID;
BEGIN
  -- Find the word in the words table
  SELECT * INTO word_record
  FROM public.words 
  WHERE word = target_word;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Word "%" not found in words table', target_word;
  END IF;
  
  -- Insert or update the word of the day, including the word text
  INSERT INTO public.word_of_the_day (word_id, word, date)
  VALUES (word_record.id, target_word, target_date)
  ON CONFLICT (date) 
  DO UPDATE SET 
    word_id = EXCLUDED.word_id,
    word = EXCLUDED.word,
    updated_at = NOW()
  RETURNING id INTO wotd_id;
  
  RETURN wotd_id;
END;
$$;

-- Update the set_tomorrows_word_of_the_day function to include the word column
CREATE OR REPLACE FUNCTION public.set_tomorrows_word_of_the_day()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tomorrow_date DATE;
  random_word TEXT;
  wotd_id UUID;
BEGIN
  -- Get tomorrow's date
  tomorrow_date := CURRENT_DATE + INTERVAL '1 day';
  
  -- Get a random word (you can adjust difficulty as needed)
  random_word := public.get_random_word_for_day('easy');
  
  -- Set the word for tomorrow
  SELECT public.set_word_of_the_day(random_word, tomorrow_date) INTO wotd_id;
  
  RETURN wotd_id;
END;
$$;

-- Update the cron function if it exists (from setup_word_of_day_cron.sql)
CREATE OR REPLACE FUNCTION public.cron_update_word_of_day()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tomorrow_date DATE;
  random_word TEXT;
  word_rec RECORD;
BEGIN
  -- Get tomorrow's date
  tomorrow_date := CURRENT_DATE + INTERVAL '1 day';
  
  -- Check if tomorrow already has a word set
  IF EXISTS (SELECT 1 FROM public.word_of_the_day WHERE date = tomorrow_date) THEN
    RAISE NOTICE 'Word of the day already set for %', tomorrow_date;
    RETURN;
  END IF;
  
  -- Get a random word from the words table
  SELECT * INTO word_rec
  FROM public.words 
  WHERE difficulty = 'easy'
  ORDER BY RANDOM()
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No words available in words table';
  END IF;
  
  -- Insert tomorrow's word
  INSERT INTO public.word_of_the_day (word_id, word, date)
  VALUES (word_rec.id, word_rec.word, tomorrow_date);
  
  RAISE NOTICE 'Word of the day set for %: %', tomorrow_date, word_rec.word;
END;
$$;

