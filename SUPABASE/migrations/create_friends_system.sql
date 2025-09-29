-- Friends System Tables
-- Run this in your Supabase SQL Editor

-- 1. Friend Requests Table
CREATE TABLE public.friend_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure users can't send requests to themselves
  CONSTRAINT no_self_requests CHECK (sender_id != receiver_id),
  
  -- Ensure one pending request per sender-receiver pair
  CONSTRAINT unique_pending_request UNIQUE (sender_id, receiver_id) 
    DEFERRABLE INITIALLY DEFERRED
);

-- 2. Friends Table (actual friendships)
CREATE TABLE public.friends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure users can't be friends with themselves
  CONSTRAINT no_self_friendship CHECK (user_id != friend_id),
  
  -- Ensure unique friendships (no duplicates)
  CONSTRAINT unique_friendship UNIQUE (user_id, friend_id)
  
  -- Note: Bidirectional friendships are handled by inserting both directions
);

-- Enable Row Level Security
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Friend Requests RLS Policies
CREATE POLICY "Users can view their own friend requests" ON public.friend_requests
  FOR SELECT USING (
    auth.uid() = sender_id OR 
    auth.uid() = receiver_id
  );

CREATE POLICY "Users can create friend requests" ON public.friend_requests
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update friend requests they received" ON public.friend_requests
  FOR UPDATE USING (auth.uid() = receiver_id);

CREATE POLICY "Users can delete friend requests they sent or received" ON public.friend_requests
  FOR DELETE USING (
    auth.uid() = sender_id OR 
    auth.uid() = receiver_id
  );

-- Friends RLS Policies
CREATE POLICY "Users can view their own friendships" ON public.friends
  FOR SELECT USING (
    auth.uid() = user_id OR 
    auth.uid() = friend_id
  );

CREATE POLICY "Users can create friendships" ON public.friends
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR 
    auth.uid() = friend_id
  );

CREATE POLICY "Users can delete their own friendships" ON public.friends
  FOR DELETE USING (
    auth.uid() = user_id OR 
    auth.uid() = friend_id
  );

-- Create indexes for better performance
CREATE INDEX idx_friend_requests_sender ON public.friend_requests(sender_id);
CREATE INDEX idx_friend_requests_receiver ON public.friend_requests(receiver_id);
CREATE INDEX idx_friend_requests_status ON public.friend_requests(status);
CREATE INDEX idx_friends_user_id ON public.friends(user_id);
CREATE INDEX idx_friends_friend_id ON public.friends(friend_id);

-- Create function to handle friend request acceptance
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
  
  -- Update request status
  UPDATE public.friend_requests 
  SET status = 'accepted', updated_at = NOW()
  WHERE id = request_id;
  
END;
$$;

-- Create function to get user's friends
CREATE OR REPLACE FUNCTION public.get_user_friends(user_uuid UUID)
RETURNS TABLE (
  friend_id UUID,
  username TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.friend_id,
    p.username,
    p.email,
    f.created_at
  FROM public.friends f
  JOIN public.profiles p ON f.friend_id = p.id
  WHERE f.user_id = user_uuid
  ORDER BY f.created_at DESC;
END;
$$;

-- Create function to get user's pending friend requests
CREATE OR REPLACE FUNCTION public.get_pending_requests(user_uuid UUID)
RETURNS TABLE (
  request_id UUID,
  sender_id UUID,
  sender_username TEXT,
  sender_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fr.id,
    fr.sender_id,
    p.username,
    p.email,
    fr.created_at
  FROM public.friend_requests fr
  JOIN public.profiles p ON fr.sender_id = p.id
  WHERE fr.receiver_id = user_uuid 
    AND fr.status = 'pending'
  ORDER BY fr.created_at DESC;
END;
$$;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.friend_requests TO anon, authenticated;
GRANT ALL ON public.friends TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_friends(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_requests(UUID) TO authenticated;
