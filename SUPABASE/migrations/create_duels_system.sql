

-- 1. Duels Table
CREATE TABLE public.duels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  challenger_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opponent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  word TEXT NOT NULL, -- The actual word to draw
  difficulty TEXT DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  gamemode TEXT DEFAULT 'doodleDuel' CHECK (gamemode IN ('doodleDuel', 'doodleHunt')),
  challenger_drawing_id UUID REFERENCES public.drawings(id),
  opponent_drawing_id UUID REFERENCES public.drawings(id),
  status TEXT NOT NULL DEFAULT 'duel_sent' CHECK (status IN ('duel_sent', 'in_progress', 'completed')),
  accepted BOOLEAN DEFAULT FALSE, -- Whether the opponent has accepted the duel
  winner_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure users can't duel themselves
  CONSTRAINT no_self_duel CHECK (challenger_id != opponent_id)
  
  -- Note: Multiple duels between same users are allowed as long as they're not both active
);

-- Enable Row Level Security
ALTER TABLE public.duels ENABLE ROW LEVEL SECURITY;

-- Duels RLS Policies
CREATE POLICY "Users can view duels they're involved in" ON public.duels
  FOR SELECT USING (
    auth.uid() = challenger_id OR 
    auth.uid() = opponent_id
  );

CREATE POLICY "Users can create duels" ON public.duels
  FOR INSERT WITH CHECK (auth.uid() = challenger_id);

CREATE POLICY "Users can update duels they're involved in" ON public.duels
  FOR UPDATE USING (
    auth.uid() = challenger_id OR 
    auth.uid() = opponent_id
  );

-- Create indexes for better performance
CREATE INDEX idx_duels_challenger_id ON public.duels(challenger_id);
CREATE INDEX idx_duels_opponent_id ON public.duels(opponent_id);
CREATE INDEX idx_duels_status ON public.duels(status);
CREATE INDEX idx_duels_word ON public.duels(word);
CREATE INDEX idx_duels_difficulty ON public.duels(difficulty);
CREATE INDEX idx_duels_gamemode ON public.duels(gamemode);

-- Create function to get random word by difficulty
CREATE OR REPLACE FUNCTION public.get_random_word(difficulty_level TEXT DEFAULT 'easy')
RETURNS TABLE (
  id UUID,
  word TEXT,
  difficulty TEXT,
  category TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id,
    w.word,
    w.difficulty,
    w.category
  FROM public.words w
  WHERE w.difficulty = difficulty_level
  ORDER BY RANDOM()
  LIMIT 1;
END;
$$;

-- Create function to create a duel
CREATE OR REPLACE FUNCTION public.create_duel(
  opponent_uuid UUID,
  word_text TEXT,
  difficulty_level TEXT DEFAULT 'easy',
  game_mode TEXT DEFAULT 'doodleDuel'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  duel_id UUID;
BEGIN
  -- Validate gamemode
  IF game_mode NOT IN ('doodleDuel', 'doodleHunt') THEN
    RAISE EXCEPTION 'Invalid gamemode. Must be doodleDuel or doodleHunt';
  END IF;
  
  -- Check if there's already an active duel between these users
  IF EXISTS (
    SELECT 1 FROM public.duels 
    WHERE ((challenger_id = auth.uid() AND opponent_id = opponent_uuid) 
           OR (challenger_id = opponent_uuid AND opponent_id = auth.uid()))
    AND status IN ('duel_sent', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'An active duel already exists between these users';
  END IF;
  
  -- Create the duel with status 'duel_sent'
  INSERT INTO public.duels (challenger_id, opponent_id, word, difficulty, gamemode, status)
  VALUES (auth.uid(), opponent_uuid, word_text, difficulty_level, game_mode, 'duel_sent')
  RETURNING id INTO duel_id;
  
  RETURN duel_id;
END;
$$;

-- Create function to accept a duel
CREATE OR REPLACE FUNCTION public.accept_duel(duel_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  duel_record RECORD;
BEGIN
  -- Get the duel details
  SELECT * INTO duel_record
  FROM public.duels 
  WHERE id = duel_uuid 
    AND opponent_id = auth.uid()
    AND status = 'duel_sent';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel not found or not authorized to accept';
  END IF;
  
  -- Update duel status to in_progress and set accepted to true
  UPDATE public.duels 
  SET status = 'in_progress', 
      accepted = TRUE, 
      updated_at = NOW()
  WHERE id = duel_uuid;
END;
$$;

-- Create function to decline/delete a duel
CREATE OR REPLACE FUNCTION public.decline_duel(duel_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  duel_record RECORD;
BEGIN
  -- Get the duel details
  SELECT * INTO duel_record
  FROM public.duels 
  WHERE id = duel_uuid 
    AND opponent_id = auth.uid()
    AND status = 'duel_sent';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel not found or not authorized to decline';
  END IF;
  
  -- Delete the duel
  DELETE FROM public.duels 
  WHERE id = duel_uuid;
END;
$$;

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.submit_duel_drawing(UUID, TEXT, INTEGER);

-- Create function to submit drawing to duel
CREATE OR REPLACE FUNCTION public.submit_duel_drawing(
  duel_uuid UUID,
  svg_url TEXT,
  ai_score INTEGER,
  ai_message TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  duel_record RECORD;
  drawing_id UUID;
  challenger_score INTEGER;
  opponent_score INTEGER;
  calculated_winner_id UUID;
BEGIN
  -- Get the duel details
  SELECT * INTO duel_record
  FROM public.duels 
  WHERE id = duel_uuid 
    AND (challenger_id = auth.uid() OR opponent_id = auth.uid())
    AND status = 'in_progress';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel not found or not authorized';
  END IF;
  
  -- Create drawing record
  INSERT INTO public.drawings (user_id, word, svg_url, score, message)
  VALUES (auth.uid(), duel_record.word, svg_url, ai_score, ai_message)
  RETURNING id INTO drawing_id;
  
  -- Update duel with drawing ID
  IF auth.uid() = duel_record.challenger_id THEN
    UPDATE public.duels 
    SET challenger_drawing_id = drawing_id, updated_at = NOW()
    WHERE id = duel_uuid;
  ELSE
    UPDATE public.duels 
    SET opponent_drawing_id = drawing_id, updated_at = NOW()
    WHERE id = duel_uuid;
  END IF;
  
  -- Check if both drawings are submitted after updating the current drawing
  -- We need to get the updated duel record to check if both drawings are now present
  DECLARE
    updated_challenger_drawing_id UUID;
    updated_opponent_drawing_id UUID;
  BEGIN
    SELECT challenger_drawing_id, opponent_drawing_id 
    INTO updated_challenger_drawing_id, updated_opponent_drawing_id
    FROM public.duels 
    WHERE id = duel_uuid;
    
    IF updated_challenger_drawing_id IS NOT NULL AND updated_opponent_drawing_id IS NOT NULL THEN
      -- Get both drawings to compare scores
      SELECT score INTO challenger_score FROM public.drawings WHERE id = updated_challenger_drawing_id;
      SELECT score INTO opponent_score FROM public.drawings WHERE id = updated_opponent_drawing_id;
      
      -- Get the current duel data to ensure we have the correct user IDs
      DECLARE
        current_challenger_id UUID;
        current_opponent_id UUID;
      BEGIN
        SELECT challenger_id, opponent_id 
        INTO current_challenger_id, current_opponent_id
        FROM public.duels 
        WHERE id = duel_uuid;
        
        -- Determine winner based on higher score
        IF challenger_score > opponent_score THEN
          calculated_winner_id := current_challenger_id;
        ELSIF opponent_score > challenger_score THEN
          calculated_winner_id := current_opponent_id;
        ELSE
          -- Tie - no winner
          calculated_winner_id := NULL;
        END IF;
        
        -- Log the winner calculation for debugging
        RAISE NOTICE 'Winner calculation: challenger_score=%, opponent_score=%, winner_id=%', 
          challenger_score, opponent_score, calculated_winner_id;
      END;
      
      UPDATE public.duels 
      SET status = 'completed', winner_id = calculated_winner_id, updated_at = NOW()
      WHERE id = duel_uuid;
    END IF;
  END;
  
  RETURN drawing_id;
END;
$$;

-- Enable realtime for duels table
ALTER PUBLICATION supabase_realtime ADD TABLE public.duels;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.drawings TO anon, authenticated;
GRANT ALL ON public.duels TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_random_word(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_duel(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_duel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_duel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_duel_drawing(UUID, TEXT, INTEGER, TEXT) TO authenticated;
