-- Words Table for Drawing Game
-- Run this in your Supabase SQL Editor

-- Create Words Table
CREATE TABLE public.words (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  word TEXT NOT NULL UNIQUE,
  difficulty TEXT DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;

-- Words RLS Policies
CREATE POLICY "Anyone can view words" ON public.words
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert words" ON public.words
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update words" ON public.words
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete words" ON public.words
  FOR DELETE USING (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX idx_words_difficulty ON public.words(difficulty);
CREATE INDEX idx_words_category ON public.words(category);
CREATE INDEX idx_words_word ON public.words(word);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.words TO anon, authenticated;
