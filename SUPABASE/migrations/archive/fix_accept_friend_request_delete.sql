-- Fix accept_friend_request function to delete the request instead of updating status
-- This ensures that accepted friend requests are removed from the database

CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_record RECORD;
BEGIN
  -- Get the friend request
  SELECT sender_id, receiver_id 
  INTO request_record
  FROM public.friend_requests 
  WHERE id = request_id 
    AND status = 'pending'
    AND receiver_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found or not authorized';
  END IF;
  
  -- Create bidirectional friendship
  -- Insert friendship in both directions
  INSERT INTO public.friends (user_id, friend_id)
  VALUES (request_record.sender_id, request_record.receiver_id)
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  
  INSERT INTO public.friends (user_id, friend_id)
  VALUES (request_record.receiver_id, request_record.sender_id)
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  
  -- Delete the friend request instead of updating status
  DELETE FROM public.friend_requests 
  WHERE id = request_id;
  
END;
$$;
