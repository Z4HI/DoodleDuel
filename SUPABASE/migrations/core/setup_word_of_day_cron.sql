-- Setup cron job for Word of the Day
-- This migration sets up a pg_cron job to automatically update the word of the day daily at midnight

-- Enable the pg_cron extension (if not already enabled)
-- Note: This might need to be enabled by your Supabase admin
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function that calls the edge function
-- Since pg_cron runs within the database, we'll create a function that sets tomorrow's word
CREATE OR REPLACE FUNCTION public.cron_update_word_of_day()
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
  random_word := public.get_random_word_for_day('easy');
  
  -- Set the word for tomorrow (this will also set today's if it doesn't exist)
  PERFORM public.set_word_of_the_day(random_word, tomorrow_date);
  
  -- Also ensure today's word exists
  IF NOT EXISTS (
    SELECT 1 FROM public.word_of_the_day 
    WHERE date = CURRENT_DATE
  ) THEN
    PERFORM public.set_word_of_the_day(random_word, CURRENT_DATE);
  END IF;
  
  -- Log the action
  RAISE NOTICE 'Updated word of the day for %: %', tomorrow_date, random_word;
END;
$$;

-- Create the cron job to run daily at midnight (00:00)
-- This will run every day at midnight UTC
SELECT cron.schedule(
  'update-word-of-day',
  '0 0 * * *',  -- Run at 00:00 every day
  'SELECT public.cron_update_word_of_day();'
);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.cron_update_word_of_day() TO service_role;

-- Note: If pg_cron is not available, you can alternatively:
-- 1. Use a third-party cron service like cron-job.org
-- 2. Use GitHub Actions with a scheduled workflow
-- 3. Use a cloud function with a scheduler (AWS Lambda + EventBridge, Google Cloud Functions + Cloud Scheduler, etc.)
-- 4. Use a service like Vercel Cron or Railway Cron

-- Alternative: Manual trigger function for testing
CREATE OR REPLACE FUNCTION public.trigger_word_of_day_update()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Call the cron function
  PERFORM public.cron_update_word_of_day();
  
  -- Return current word of the day info
  SELECT json_build_object(
    'success', true,
    'message', 'Word of the day updated successfully',
    'current_word', w.word,
    'current_date', wotd.date
  ) INTO result
  FROM public.word_of_the_day wotd
  JOIN public.words w ON wotd.word_id = w.id
  WHERE wotd.date = CURRENT_DATE;
  
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_word_of_day_update() TO service_role;
