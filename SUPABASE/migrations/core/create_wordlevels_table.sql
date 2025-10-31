-- Create wordlevels table for Doodle Hunt Dash leveling system
CREATE TABLE public.wordlevels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  word TEXT NOT NULL,               -- the word to guess
  level INT NOT NULL,               -- the game level
  difficulty TEXT DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  category TEXT,                    -- optional category
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(word, level)               -- ensures the same word isn't assigned to the same level
);

-- Create indexes for better query performance
CREATE INDEX idx_wordlevels_level ON public.wordlevels(level);
CREATE INDEX idx_wordlevels_difficulty ON public.wordlevels(difficulty);
CREATE INDEX idx_wordlevels_category ON public.wordlevels(category);

-- Enable Row Level Security (RLS)
ALTER TABLE public.wordlevels ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all authenticated users to read wordlevels
CREATE POLICY "Allow authenticated users to read wordlevels" ON public.wordlevels
  FOR SELECT USING (auth.role() = 'authenticated');

-- Create a policy that allows authenticated users to insert wordlevels (for admin purposes)
CREATE POLICY "Allow authenticated users to insert wordlevels" ON public.wordlevels
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create a policy that allows authenticated users to update wordlevels (for admin purposes)
CREATE POLICY "Allow authenticated users to update wordlevels" ON public.wordlevels
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Function to get a random word for a specific level
CREATE OR REPLACE FUNCTION get_word_for_level(target_level INT, target_difficulty TEXT DEFAULT 'easy')
RETURNS TABLE (
  word_id UUID,
  word TEXT,
  level INT,
  difficulty TEXT,
  category TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wl.id as word_id,
    wl.word,
    wl.level,
    wl.difficulty,
    wl.category
  FROM public.wordlevels wl
  WHERE wl.level = target_level 
    AND wl.difficulty = target_difficulty
  ORDER BY RANDOM()
  LIMIT 1;
END;
$$;

-- Function to get words for a range of levels
CREATE OR REPLACE FUNCTION get_words_for_levels(min_level INT, max_level INT, target_difficulty TEXT DEFAULT 'easy')
RETURNS TABLE (
  word_id UUID,
  word TEXT,
  level INT,
  difficulty TEXT,
  category TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wl.id as word_id,
    wl.word,
    wl.level,
    wl.difficulty,
    wl.category
  FROM public.wordlevels wl
  WHERE wl.level >= min_level 
    AND wl.level <= max_level
    AND wl.difficulty = target_difficulty
  ORDER BY wl.level, RANDOM();
END;
$$;

-- Function to get the next level word for a user
CREATE OR REPLACE FUNCTION get_next_level_word(user_current_level INT, target_difficulty TEXT DEFAULT 'easy')
RETURNS TABLE (
  word_id UUID,
  word TEXT,
  level INT,
  difficulty TEXT,
  category TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wl.id as word_id,
    wl.word,
    wl.level,
    wl.difficulty,
    wl.category
  FROM public.wordlevels wl
  WHERE wl.level = (user_current_level + 1)
    AND wl.difficulty = target_difficulty
  ORDER BY RANDOM()
  LIMIT 1;
END;
$$;


-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.wordlevels TO authenticated;
GRANT EXECUTE ON FUNCTION get_word_for_level(INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_words_for_levels(INT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_level_word(INT, TEXT) TO authenticated;
