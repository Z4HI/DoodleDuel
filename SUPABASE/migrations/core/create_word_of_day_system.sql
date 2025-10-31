-- Word of the Day System
-- This migration creates the infrastructure for daily word rotation

-- Create word_of_the_day table to track the current daily word
CREATE TABLE public.word_of_the_day (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE RESTRICT,
  date DATE NOT NULL UNIQUE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.word_of_the_day ENABLE ROW LEVEL SECURITY;

-- Word of the Day RLS Policies
CREATE POLICY "Anyone can view word of the day" ON public.word_of_the_day
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage word of the day" ON public.word_of_the_day
  FOR ALL USING (auth.role() = 'service_role');

-- Create indexes for better performance
CREATE INDEX idx_word_of_the_day_date ON public.word_of_the_day(date);
CREATE INDEX idx_word_of_the_day_word_id ON public.word_of_the_day(word_id);

-- Function to get the current word of the day
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
    w.id,
    w.word,
    w.difficulty,
    w.category,
    wotd.date
  FROM public.word_of_the_day wotd
  JOIN public.words w ON wotd.word_id = w.id
  WHERE wotd.date = CURRENT_DATE;
END;
$$;

-- Function to set a new word of the day (for admin/service use)
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
  
  -- Insert or update the word of the day
  INSERT INTO public.word_of_the_day (word_id, date)
  VALUES (word_record.id, target_date)
  ON CONFLICT (date) 
  DO UPDATE SET 
    word_id = EXCLUDED.word_id,
    updated_at = NOW()
  RETURNING id INTO wotd_id;
  
  RETURN wotd_id;
END;
$$;

-- Function to get a random word for the day (used by the cron job)
CREATE OR REPLACE FUNCTION public.get_random_word_for_day(
  difficulty_level TEXT DEFAULT 'easy'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  random_word TEXT;
BEGIN
  SELECT word INTO random_word
  FROM public.words 
  WHERE difficulty = difficulty_level
  ORDER BY RANDOM()
  LIMIT 1;
  
  IF random_word IS NULL THEN
    RAISE EXCEPTION 'No words found for difficulty level: %', difficulty_level;
  END IF;
  
  RETURN random_word;
END;
$$;

-- Function to automatically set tomorrow's word of the day
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

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.word_of_the_day TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_word_of_the_day() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_word_of_the_day(TEXT, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_random_word_for_day(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_tomorrows_word_of_the_day() TO service_role;

-- Set today's word of the day if none exists
-- This will pick a random easy word from your existing words table
INSERT INTO public.word_of_the_day (word_id, date)
SELECT w.id, CURRENT_DATE
FROM public.words w
WHERE w.difficulty = 'easy'
ORDER BY RANDOM()
LIMIT 1
ON CONFLICT (date) DO NOTHING;
