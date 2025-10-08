-- DoodleHunt Solo Game System
-- This migration creates the infrastructure for DoodleHunt solo games

-- 1. DoodleHunt Solo Games Table
CREATE TABLE public.doodle_hunt_solo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_word TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'won', 'lost')),
  final_score INTEGER DEFAULT 0 CHECK (final_score >= 0 AND final_score <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure only one active game per user
  CONSTRAINT one_active_game_per_user UNIQUE (user_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- 2. Guesses Table
CREATE TABLE public.guesses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.doodle_hunt_solo(id) ON DELETE CASCADE,
  guess_number INTEGER NOT NULL CHECK (guess_number >= 1 AND guess_number <= 5),
  target_word TEXT NOT NULL,
  ai_guess_word TEXT NOT NULL,
  similarity_score INTEGER NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique guess numbers per game
  CONSTRAINT unique_guess_per_game UNIQUE (game_id, guess_number)
);

-- Enable Row Level Security
ALTER TABLE public.doodle_hunt_solo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guesses ENABLE ROW LEVEL SECURITY;

-- DoodleHunt Solo Games RLS Policies
CREATE POLICY "Users can view their own doodle hunt games" ON public.doodle_hunt_solo
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own doodle hunt games" ON public.doodle_hunt_solo
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own doodle hunt games" ON public.doodle_hunt_solo
  FOR UPDATE USING (auth.uid() = user_id);

-- Guesses RLS Policies
CREATE POLICY "Users can view guesses for their games" ON public.guesses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.doodle_hunt_solo 
      WHERE id = game_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create guesses for their games" ON public.guesses
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doodle_hunt_solo 
      WHERE id = game_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update guesses for their games" ON public.guesses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.doodle_hunt_solo 
      WHERE id = game_id AND user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX idx_doodle_hunt_solo_user_id ON public.doodle_hunt_solo(user_id);
CREATE INDEX idx_doodle_hunt_solo_status ON public.doodle_hunt_solo(status);
CREATE INDEX idx_doodle_hunt_solo_created_at ON public.doodle_hunt_solo(created_at);
CREATE INDEX idx_guesses_game_id ON public.guesses(game_id);
CREATE INDEX idx_guesses_guess_number ON public.guesses(guess_number);
CREATE INDEX idx_guesses_similarity_score ON public.guesses(similarity_score);

-- Function to create a new DoodleHunt game
CREATE OR REPLACE FUNCTION public.create_doodle_hunt_game(
  target_word_text TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  game_id UUID;
  user_uuid UUID;
BEGIN
  -- Get current user
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to create a game';
  END IF;
  
  -- Check if user has an active game
  IF EXISTS (
    SELECT 1 FROM public.doodle_hunt_solo 
    WHERE user_id = user_uuid AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'User already has an active DoodleHunt game';
  END IF;
  
  -- Create the game
  INSERT INTO public.doodle_hunt_solo (user_id, target_word, status)
  VALUES (user_uuid, target_word_text, 'in_progress')
  RETURNING id INTO game_id;
  
  RETURN game_id;
END;
$$;

-- Function to add a guess to a game
CREATE OR REPLACE FUNCTION public.add_doodle_hunt_guess(
  game_uuid UUID,
  guess_num INTEGER,
  target_word_text TEXT,
  ai_guess_text TEXT,
  similarity_num INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  guess_id UUID;
  user_uuid UUID;
  game_status TEXT;
BEGIN
  -- Get current user
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to add a guess';
  END IF;
  
  -- Verify the game belongs to the user and is active
  SELECT status INTO game_status
  FROM public.doodle_hunt_solo 
  WHERE id = game_uuid AND user_id = user_uuid;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found or not authorized';
  END IF;
  
  IF game_status != 'in_progress' THEN
    RAISE EXCEPTION 'Game is not in progress';
  END IF;
  
  -- Add the guess
  INSERT INTO public.guesses (game_id, guess_number, target_word, ai_guess_word, similarity_score)
  VALUES (game_uuid, guess_num, target_word_text, ai_guess_text, similarity_num)
  RETURNING id INTO guess_id;
  
  -- Update game final score if this is the best guess so far
  UPDATE public.doodle_hunt_solo 
  SET final_score = GREATEST(final_score, similarity_num),
      updated_at = NOW()
  WHERE id = game_uuid;
  
  RETURN guess_id;
END;
$$;

-- Function to complete a DoodleHunt game
CREATE OR REPLACE FUNCTION public.complete_doodle_hunt_game(
  game_uuid UUID,
  game_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid UUID;
BEGIN
  -- Get current user
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to complete a game';
  END IF;
  
  -- Validate status
  IF game_status NOT IN ('won', 'lost') THEN
    RAISE EXCEPTION 'Invalid game status. Must be "won" or "lost"';
  END IF;
  
  -- Update the game
  UPDATE public.doodle_hunt_solo 
  SET status = game_status,
      updated_at = NOW()
  WHERE id = game_uuid AND user_id = user_uuid;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found or not authorized';
  END IF;
END;
$$;

-- Function to get user's DoodleHunt game history
CREATE OR REPLACE FUNCTION public.get_doodle_hunt_history(
  user_uuid UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  game_id UUID,
  target_word TEXT,
  status TEXT,
  final_score INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  total_guesses INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dhs.id,
    dhs.target_word,
    dhs.status,
    dhs.final_score,
    dhs.created_at,
    COUNT(g.id)::INTEGER as total_guesses
  FROM public.doodle_hunt_solo dhs
  LEFT JOIN public.guesses g ON dhs.id = g.game_id
  WHERE dhs.user_id = user_uuid
  GROUP BY dhs.id, dhs.target_word, dhs.status, dhs.final_score, dhs.created_at
  ORDER BY dhs.created_at DESC;
END;
$$;

-- Function to get guesses for a specific game
CREATE OR REPLACE FUNCTION public.get_doodle_hunt_guesses(
  game_uuid UUID
)
RETURNS TABLE (
  guess_id UUID,
  guess_number INTEGER,
  target_word TEXT,
  ai_guess_word TEXT,
  similarity_score INTEGER,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid UUID;
BEGIN
  -- Get current user
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to view guesses';
  END IF;
  
  -- Verify the game belongs to the user
  IF NOT EXISTS (
    SELECT 1 FROM public.doodle_hunt_solo 
    WHERE id = game_uuid AND user_id = user_uuid
  ) THEN
    RAISE EXCEPTION 'Game not found or not authorized';
  END IF;
  
  RETURN QUERY
  SELECT 
    g.id,
    g.guess_number,
    g.target_word,
    g.ai_guess_word,
    g.similarity_score,
    g.created_at
  FROM public.guesses g
  WHERE g.game_id = game_uuid
  ORDER BY g.guess_number ASC;
END;
$$;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.doodle_hunt_solo TO anon, authenticated, service_role;
GRANT ALL ON public.guesses TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_doodle_hunt_game(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_doodle_hunt_guess(UUID, INTEGER, TEXT, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_doodle_hunt_game(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_doodle_hunt_history(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_doodle_hunt_guesses(UUID) TO anon, authenticated;
