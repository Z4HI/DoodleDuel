-- Add comprehensive cleanup function for both regular and roulette matches
-- This function will be called when users close the app or go to background

CREATE OR REPLACE FUNCTION public.cleanup_all_user_waiting_matches()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Remove user from all waiting regular matches
  DELETE FROM public.match_participants 
  WHERE user_id = auth.uid() 
    AND match_id IN (
      SELECT id FROM public.matches WHERE status = 'waiting'
    );
  
  -- Clean up any empty waiting regular matches
  DELETE FROM public.matches 
  WHERE status = 'waiting' 
    AND id NOT IN (
      SELECT DISTINCT match_id FROM public.match_participants
    );

  -- Remove user from all waiting roulette matches
  DELETE FROM public.roulette_participants 
  WHERE user_id = auth.uid() 
    AND match_id IN (
      SELECT id FROM public.roulette_matches WHERE status = 'waiting'
    );
  
  -- Clean up any empty waiting roulette matches
  DELETE FROM public.roulette_matches 
  WHERE status = 'waiting' 
    AND id NOT IN (
      SELECT DISTINCT match_id FROM public.roulette_participants
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.cleanup_all_user_waiting_matches() TO authenticated;
