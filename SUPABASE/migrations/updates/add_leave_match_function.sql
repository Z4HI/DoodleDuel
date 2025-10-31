-- Add function to leave a match
-- This allows users to remove themselves from waiting matches

CREATE OR REPLACE FUNCTION public.leave_match(
  target_match_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  match_record RECORD;
  participant_count INTEGER;
BEGIN
  -- Get the match details
  SELECT * INTO match_record
  FROM public.matches 
  WHERE id = target_match_id;
  
  IF NOT FOUND THEN
    -- Match not found, silently exit (it may have been deleted)
    RETURN;
  END IF;
  
  -- Only allow leaving if match is in waiting status
  -- If match is active or completed, user should not leave
  IF match_record.status != 'waiting' THEN
    -- Silently exit if match is already active or completed
    RETURN;
  END IF;
  
  -- Remove user from the match
  DELETE FROM public.match_participants 
  WHERE match_id = target_match_id AND user_id = auth.uid();
  
  -- Check remaining participants
  SELECT COUNT(*) INTO participant_count
  FROM public.match_participants 
  WHERE match_id = target_match_id;
  
  -- If no participants left, delete the match
  IF participant_count = 0 THEN
    DELETE FROM public.matches 
    WHERE id = target_match_id;
  END IF;
END;
$$;

-- Create a function to clean up user's active waiting matches
-- This is useful when a user wants to search for a new match
CREATE OR REPLACE FUNCTION public.cleanup_user_waiting_matches()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Remove user from all waiting matches
  DELETE FROM public.match_participants 
  WHERE user_id = auth.uid() 
    AND match_id IN (
      SELECT id FROM public.matches WHERE status = 'waiting'
    );
  
  -- Clean up any empty waiting matches
  DELETE FROM public.matches 
  WHERE status = 'waiting' 
    AND id NOT IN (
      SELECT DISTINCT match_id FROM public.match_participants
    );
END;
$$;

-- Add DELETE policy for match_participants to allow users to leave matches
-- This ensures the SECURITY DEFINER functions can delete participants
DROP POLICY IF EXISTS "Users can leave matches" ON public.match_participants;
CREATE POLICY "Users can leave matches" ON public.match_participants
  FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.leave_match(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_user_waiting_matches() TO authenticated;

