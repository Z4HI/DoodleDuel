-- Doodle Hunt Daily system (similar to word_of_the_day)

-- Table storing the daily word for Doodle Hunt
CREATE TABLE IF NOT EXISTS public.doodle_hunt_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE RESTRICT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(date)
);

ALTER TABLE public.doodle_hunt_daily ENABLE ROW LEVEL SECURITY;

-- Anyone can read today's daily word
DROP POLICY IF EXISTS "Anyone can view doodle hunt daily" ON public.doodle_hunt_daily;
CREATE POLICY "Anyone can view doodle hunt daily" ON public.doodle_hunt_daily
  FOR SELECT USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_doodle_hunt_daily_date ON public.doodle_hunt_daily(date);
CREATE INDEX IF NOT EXISTS idx_doodle_hunt_daily_word_id ON public.doodle_hunt_daily(word_id);

-- Helper: get a random word id from words table
CREATE OR REPLACE FUNCTION public._get_random_word_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id
  FROM public.words
  ORDER BY random()
  LIMIT 1;
$$;

-- RPC: Get today's Doodle Hunt daily word (creates one if missing)
CREATE OR REPLACE FUNCTION public.get_doodle_hunt_daily()
RETURNS TABLE(word TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  w_id UUID;
BEGIN
  -- If today's entry doesn't exist, create it with a random word
  IF NOT EXISTS (SELECT 1 FROM public.doodle_hunt_daily WHERE date = today) THEN
    w_id := public._get_random_word_id();
    IF w_id IS NULL THEN
      RAISE EXCEPTION 'No words available to select for doodle_hunt_daily';
    END IF;
    INSERT INTO public.doodle_hunt_daily (word_id, date) VALUES (w_id, today);
  END IF;

  RETURN QUERY
  SELECT w.word
  FROM public.doodle_hunt_daily dhd
  JOIN public.words w ON w.id = dhd.word_id
  WHERE dhd.date = today
  LIMIT 1;
END;
$$;

-- RPC: Manually set the daily word (service role)
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

  INSERT INTO public.doodle_hunt_daily (word_id, date)
  VALUES (w_id, target_date)
  ON CONFLICT (date) DO UPDATE SET word_id = EXCLUDED.word_id
  RETURNING id INTO rec_id;

  RETURN rec_id;
END;
$$;

-- Ensure pg_cron extension is available (same approach as word_of_the_day)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Cron function for automated daily updates
CREATE OR REPLACE FUNCTION public.cron_update_doodle_hunt_daily()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tomorrow_date DATE;
  random_word TEXT;
BEGIN
  -- Get tomorrow's date
  tomorrow_date := CURRENT_DATE + INTERVAL '1 day';
  
  -- Get a random word for tomorrow
  random_word := public._get_random_word_id();
  IF random_word IS NULL THEN
    RAISE EXCEPTION 'No words available to select for doodle_hunt_daily';
  END IF;
  
  -- Set the word for tomorrow
  PERFORM public.set_doodle_hunt_daily(
    (SELECT word FROM public.words WHERE id = random_word), 
    tomorrow_date
  );
  
  -- Also ensure today's word exists
  IF NOT EXISTS (
    SELECT 1 FROM public.doodle_hunt_daily 
    WHERE date = CURRENT_DATE
  ) THEN
    PERFORM public.set_doodle_hunt_daily(
      (SELECT word FROM public.words WHERE id = random_word), 
      CURRENT_DATE
    );
  END IF;
  
  -- Log the action
  RAISE NOTICE 'Updated doodle hunt daily for %: %', tomorrow_date, (SELECT word FROM public.words WHERE id = random_word);
END;
$$;

-- Create the cron job to run daily at midnight (00:00)
-- This will run every day at midnight UTC
SELECT cron.schedule(
  'update-doodle-hunt-daily',
  '0 0 * * *',  -- Run at 00:00 every day
  'SELECT public.cron_update_doodle_hunt_daily();'
);

-- Manual trigger function for testing
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
  
  -- Return current doodle hunt daily info
  SELECT json_build_object(
    'success', true,
    'message', 'Doodle hunt daily updated successfully',
    'current_word', w.word,
    'current_date', dhd.date
  ) INTO result
  FROM public.doodle_hunt_daily dhd
  JOIN public.words w ON dhd.word_id = w.id
  WHERE dhd.date = CURRENT_DATE;
  
  RETURN result;
END;
$$;

GRANT ALL ON public.doodle_hunt_daily TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_doodle_hunt_daily() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_doodle_hunt_daily(TEXT, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_update_doodle_hunt_daily() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_doodle_hunt_daily_update() TO service_role;


