-- Create doodle_hunt_dash_games table to track user progress and active games
CREATE TABLE public.doodle_hunt_dash_games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_level INT NOT NULL DEFAULT 1,
  current_word_id UUID REFERENCES public.wordlevels(id),
  current_word TEXT NOT NULL, -- denormalized for easier access
  current_difficulty TEXT DEFAULT 'easy' CHECK (current_difficulty IN ('easy', 'medium', 'hard')),
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'paused')),
  guesses_left INT DEFAULT 5,
  total_attempts INT DEFAULT 0,
  best_score INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better query performance
CREATE INDEX idx_doodle_hunt_dash_games_user_id ON public.doodle_hunt_dash_games(user_id);
CREATE INDEX idx_doodle_hunt_dash_games_status ON public.doodle_hunt_dash_games(status);
CREATE INDEX idx_doodle_hunt_dash_games_current_level ON public.doodle_hunt_dash_games(current_level);
CREATE INDEX idx_doodle_hunt_dash_games_current_word_id ON public.doodle_hunt_dash_games(current_word_id);

-- Create partial unique index to ensure only one active game per user
CREATE UNIQUE INDEX idx_unique_active_dash_game_per_user 
ON public.doodle_hunt_dash_games(user_id) 
WHERE status = 'in_progress';

-- Enable Row Level Security (RLS)
ALTER TABLE public.doodle_hunt_dash_games ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own dash games" ON public.doodle_hunt_dash_games
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dash games" ON public.doodle_hunt_dash_games
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dash games" ON public.doodle_hunt_dash_games
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dash games" ON public.doodle_hunt_dash_games
  FOR DELETE USING (auth.uid() = user_id);

-- Function to get or create an active dash game for a user
CREATE OR REPLACE FUNCTION get_or_create_dash_game(
  target_difficulty TEXT DEFAULT 'easy'
)
RETURNS TABLE (
  game_id UUID,
  user_id UUID,
  current_level INT,
  current_word TEXT,
  current_difficulty TEXT,
  guesses_left INT,
  total_attempts INT,
  best_score INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  active_game RECORD;
  word_data RECORD;
  new_game_id UUID;
BEGIN
  -- Check if user has an active game
  SELECT * INTO active_game
  FROM public.doodle_hunt_dash_games
  WHERE doodle_hunt_dash_games.user_id = auth.uid()
    AND status = 'in_progress';
  
  IF active_game.id IS NOT NULL THEN
    -- Return existing active game
    RETURN QUERY
    SELECT 
      active_game.id,
      active_game.user_id,
      active_game.current_level,
      active_game.current_word,
      active_game.current_difficulty,
      active_game.guesses_left,
      active_game.total_attempts,
      active_game.best_score;
  ELSE
    -- Create new game
    -- Get word for level 1
    SELECT * INTO word_data
    FROM get_word_for_level(1, target_difficulty);
    
    IF word_data.word_id IS NULL THEN
      RAISE EXCEPTION 'No word found for level 1 with difficulty %', target_difficulty;
    END IF;
    
    -- Insert new game
    INSERT INTO public.doodle_hunt_dash_games (
      user_id,
      current_level,
      current_word_id,
      current_word,
      current_difficulty,
      guesses_left,
      total_attempts,
      best_score,
      status
    ) VALUES (
      auth.uid(),
      1,
      word_data.word_id,
      word_data.word,
      target_difficulty,
      5,
      0,
      0,
      'in_progress'
    ) RETURNING id INTO new_game_id;
    
    -- Return new game
    RETURN QUERY
    SELECT 
      new_game_id,
      auth.uid(),
      1,
      word_data.word,
      target_difficulty,
      5,
      0,
      0;
  END IF;
END;
$$;

-- Function to advance to next level
CREATE OR REPLACE FUNCTION advance_dash_level()
RETURNS TABLE (
  new_level INT,
  new_word TEXT,
  new_guesses_left INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_game RECORD;
  next_word_data RECORD;
BEGIN
  -- Get current game
  SELECT * INTO current_game
  FROM public.doodle_hunt_dash_games
  WHERE user_id = auth.uid()
    AND status = 'in_progress';
  
  IF current_game.id IS NULL THEN
    RAISE EXCEPTION 'No active dash game found';
  END IF;
  
  -- Get word for next level
  SELECT * INTO next_word_data
  FROM get_word_for_level(current_game.current_level + 1, current_game.current_difficulty);
  
  IF next_word_data.word_id IS NULL THEN
    RAISE EXCEPTION 'No word found for level % with difficulty %', 
      current_game.current_level + 1, current_game.current_difficulty;
  END IF;
  
  -- Update game to next level
  UPDATE public.doodle_hunt_dash_games
  SET 
    current_level = current_game.current_level + 1,
    current_word_id = next_word_data.word_id,
    current_word = next_word_data.word,
    guesses_left = 5,
    total_attempts = 0,
    best_score = 0,
    updated_at = NOW()
  WHERE id = current_game.id;
  
  -- Return new level info
  RETURN QUERY
  SELECT 
    current_game.current_level + 1,
    next_word_data.word,
    5;
END;
$$;

-- Function to reset guesses (for token/ad usage)
CREATE OR REPLACE FUNCTION reset_dash_guesses()
RETURNS TABLE (
  new_guesses_left INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_game RECORD;
BEGIN
  -- Get current game
  SELECT * INTO current_game
  FROM public.doodle_hunt_dash_games
  WHERE user_id = auth.uid()
    AND status = 'in_progress';
  
  IF current_game.id IS NULL THEN
    RAISE EXCEPTION 'No active dash game found';
  END IF;
  
  -- Reset guesses
  UPDATE public.doodle_hunt_dash_games
  SET 
    guesses_left = 5,
    updated_at = NOW()
  WHERE id = current_game.id;
  
  RETURN QUERY SELECT 5;
END;
$$;

-- Function to update game stats after a guess
CREATE OR REPLACE FUNCTION update_dash_game_stats(
  game_uuid UUID,
  similarity_score INT,
  hint_text TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.doodle_hunt_dash_games
  SET 
    total_attempts = total_attempts + 1,
    best_score = GREATEST(best_score, similarity_score),
    guesses_left = GREATEST(0, guesses_left - 1),
    updated_at = NOW()
  WHERE id = game_uuid
    AND user_id = auth.uid();
END;
$$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.doodle_hunt_dash_games TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_dash_game(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION advance_dash_level() TO authenticated;
GRANT EXECUTE ON FUNCTION reset_dash_guesses() TO authenticated;
GRANT EXECUTE ON FUNCTION update_dash_game_stats(UUID, INT, TEXT) TO authenticated;
