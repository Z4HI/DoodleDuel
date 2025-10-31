-- Multiplayer System Migration
-- This migration creates the infrastructure for live multiplayer matches

-- Create matches table
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'multiplayer',
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed')),
  max_players INTEGER NOT NULL DEFAULT 2,
  word TEXT NOT NULL, -- The word to draw for this match
  difficulty TEXT DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  start_time TIMESTAMPTZ, -- When the match started
  end_time TIMESTAMPTZ, -- When the match ended
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create match_participants table
CREATE TABLE public.match_participants (
  id SERIAL PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  drawing_id UUID REFERENCES public.drawings(id), -- References the drawing created by the user
  submitted BOOLEAN DEFAULT FALSE,
  score INTEGER, -- AI score for the drawing
  ranking INTEGER, -- Final ranking position (1st, 2nd, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure a user can only participate once per match
  UNIQUE(match_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

-- Matches RLS Policies - Simplified to avoid recursion
CREATE POLICY "Users can view all matches" ON public.matches
  FOR SELECT USING (true);

CREATE POLICY "Users can create matches" ON public.matches
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update matches" ON public.matches
  FOR UPDATE USING (true);

-- Match Participants RLS Policies - Simplified to avoid recursion
CREATE POLICY "Users can view all participants" ON public.match_participants
  FOR SELECT USING (true);

CREATE POLICY "Users can join matches" ON public.match_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own participation" ON public.match_participants
  FOR UPDATE USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_matches_status ON public.matches(status);
CREATE INDEX idx_matches_type ON public.matches(type);
CREATE INDEX idx_matches_created_at ON public.matches(created_at);
CREATE INDEX idx_match_participants_match_id ON public.match_participants(match_id);
CREATE INDEX idx_match_participants_user_id ON public.match_participants(user_id);
CREATE INDEX idx_match_participants_submitted ON public.match_participants(submitted);

-- Function to find or create a match
CREATE OR REPLACE FUNCTION public.find_or_create_match(
  match_type TEXT DEFAULT 'multiplayer',
  difficulty_level TEXT DEFAULT 'easy'
)
RETURNS TABLE (
  match_id UUID,
  word TEXT,
  is_new_match BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_match RECORD;
  random_word TEXT;
  new_match_id UUID;
BEGIN
  -- First, try to find an existing waiting match
  SELECT m.id, m.word INTO existing_match
  FROM public.matches m
  WHERE m.status = 'waiting' 
    AND m.type = match_type
    AND m.difficulty = difficulty_level
    AND (
      SELECT COUNT(*) 
      FROM public.match_participants mp 
      WHERE mp.match_id = m.id
    ) < m.max_players
  ORDER BY m.created_at ASC
  LIMIT 1;
  
  IF FOUND THEN
    -- Found an existing match, return it
    RETURN QUERY SELECT existing_match.id, existing_match.word, FALSE;
  ELSE
    -- No existing match found, create a new one
    -- Get a random word for the match
    SELECT w.word INTO random_word
    FROM public.words w
    WHERE w.difficulty = difficulty_level
    ORDER BY RANDOM()
    LIMIT 1;
    
    IF random_word IS NULL THEN
      RAISE EXCEPTION 'No words found for difficulty level: %', difficulty_level;
    END IF;
    
    -- Create the new match
    INSERT INTO public.matches (type, word, difficulty, status)
    VALUES (match_type, random_word, difficulty_level, 'waiting')
    RETURNING id INTO new_match_id;
    
    -- Automatically add the current user to the new match
    INSERT INTO public.match_participants (match_id, user_id)
    VALUES (new_match_id, auth.uid());
    
    RETURN QUERY SELECT new_match_id, random_word, TRUE;
  END IF;
END;
$$;

-- Function to join a match
CREATE OR REPLACE FUNCTION public.join_match(
  target_match_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  match_record RECORD;
  current_participant_count INTEGER;
BEGIN
  -- Get the match details
  SELECT * INTO match_record
  FROM public.matches 
  WHERE id = target_match_id AND status = 'waiting';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or not available for joining';
  END IF;
  
  -- Check if user is already in this match
  IF EXISTS (
    SELECT 1 FROM public.match_participants 
    WHERE match_id = target_match_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'User is already in this match';
  END IF;
  
  -- Count current participants
  SELECT COUNT(*) INTO current_participant_count
  FROM public.match_participants 
  WHERE match_id = target_match_id;
  
  -- Check if match is full
  IF current_participant_count >= match_record.max_players THEN
    RAISE EXCEPTION 'Match is full';
  END IF;
  
  -- Add user to the match
  INSERT INTO public.match_participants (match_id, user_id)
  VALUES (target_match_id, auth.uid());
  
  -- Check if match is now full and start it
  IF current_participant_count + 1 >= match_record.max_players THEN
    UPDATE public.matches 
    SET status = 'active', start_time = NOW(), updated_at = NOW()
    WHERE id = target_match_id;
  END IF;
END;
$$;

-- Function to submit a drawing for a match
CREATE OR REPLACE FUNCTION public.submit_match_drawing(
  target_match_id UUID,
  svg_url TEXT,
  ai_score INTEGER,
  ai_message TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  match_record RECORD;
  new_drawing_id UUID;
  participant_count INTEGER;
  submitted_count INTEGER;
BEGIN
  -- Get the match details
  SELECT * INTO match_record
  FROM public.matches 
  WHERE id = target_match_id AND status = 'active';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or not active';
  END IF;
  
  -- Check if user is a participant
  IF NOT EXISTS (
    SELECT 1 FROM public.match_participants 
    WHERE match_id = target_match_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'User is not a participant in this match';
  END IF;
  
  -- Check if user has already submitted
  IF EXISTS (
    SELECT 1 FROM public.match_participants 
    WHERE match_id = target_match_id AND user_id = auth.uid() AND submitted = TRUE
  ) THEN
    RAISE EXCEPTION 'User has already submitted a drawing for this match';
  END IF;
  
  -- Create drawing record
  INSERT INTO public.drawings (user_id, word, svg_url, score, message)
  VALUES (auth.uid(), match_record.word, svg_url, ai_score, ai_message)
  RETURNING id INTO new_drawing_id;
  
  -- Update match participant with drawing
  UPDATE public.match_participants 
  SET drawing_id = new_drawing_id, submitted = TRUE, score = ai_score, updated_at = NOW()
  WHERE match_id = target_match_id AND user_id = auth.uid();
  
  -- Check if all participants have submitted
  SELECT COUNT(*) INTO participant_count
  FROM public.match_participants 
  WHERE match_id = target_match_id;
  
  SELECT COUNT(*) INTO submitted_count
  FROM public.match_participants 
  WHERE match_id = target_match_id AND submitted = TRUE;
  
  -- If all participants have submitted, complete the match
  IF submitted_count >= participant_count THEN
    -- Calculate final positions based on scores
    WITH ranked_participants AS (
      SELECT 
        user_id,
        score,
        ROW_NUMBER() OVER (ORDER BY score DESC) as ranking
      FROM public.match_participants 
      WHERE match_id = target_match_id AND submitted = TRUE
    )
    UPDATE public.match_participants 
    SET ranking = ranked_participants.ranking
    FROM ranked_participants
    WHERE public.match_participants.match_id = target_match_id 
      AND public.match_participants.user_id = ranked_participants.user_id;
    
    -- Mark match as completed
    UPDATE public.matches 
    SET status = 'completed', end_time = NOW(), updated_at = NOW()
    WHERE id = target_match_id;
  END IF;
  
  RETURN new_drawing_id;
END;
$$;

-- Function to get match results
CREATE OR REPLACE FUNCTION public.get_match_results(
  target_match_id UUID
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  drawing_id UUID,
  svg_url TEXT,
  score INTEGER,
  ranking INTEGER,
  submitted BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mp.user_id,
    p.username,
    mp.drawing_id,
    d.svg_url,
    mp.score,
    mp.ranking,
    mp.submitted
  FROM public.match_participants mp
  JOIN public.profiles p ON mp.user_id = p.id
  LEFT JOIN public.drawings d ON mp.drawing_id = d.id
  WHERE mp.match_id = target_match_id
  ORDER BY mp.ranking ASC NULLS LAST, mp.score DESC NULLS LAST;
END;
$$;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.matches TO anon, authenticated;
GRANT ALL ON public.match_participants TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_or_create_match(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_match(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_match_drawing(UUID, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_results(UUID) TO authenticated;


-- Enable realtime for multiplayer tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_participants;