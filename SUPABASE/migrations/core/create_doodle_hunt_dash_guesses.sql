-- Create separate guesses table for doodle hunt dash games
CREATE TABLE public.doodle_hunt_dash_guesses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.doodle_hunt_dash_games(id) ON DELETE CASCADE,
  guess_number INTEGER NOT NULL CHECK (guess_number >= 1 AND guess_number <= 5),
  target_word TEXT NOT NULL,
  ai_guess_word TEXT NOT NULL,
  similarity_score INTEGER NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 100),
  hint TEXT,
  hint_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_dash_guesses_game_id ON public.doodle_hunt_dash_guesses(game_id);
CREATE INDEX idx_dash_guesses_guess_number ON public.doodle_hunt_dash_guesses(guess_number);
CREATE INDEX idx_dash_guesses_similarity_score ON public.doodle_hunt_dash_guesses(similarity_score);

-- Enable Row Level Security (RLS)
ALTER TABLE public.doodle_hunt_dash_guesses ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own dash guesses" ON public.doodle_hunt_dash_guesses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.doodle_hunt_dash_games 
      WHERE id = game_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own dash guesses" ON public.doodle_hunt_dash_guesses
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doodle_hunt_dash_games 
      WHERE id = game_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own dash guesses" ON public.doodle_hunt_dash_guesses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.doodle_hunt_dash_games 
      WHERE id = game_id AND user_id = auth.uid()
    )
  );

-- Grant necessary permissions
GRANT ALL ON public.doodle_hunt_dash_guesses TO authenticated;
