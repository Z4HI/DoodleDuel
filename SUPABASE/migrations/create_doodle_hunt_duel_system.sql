-- Create doodle_hunt_duel table for tracking individual player progress in duels
CREATE TABLE IF NOT EXISTS doodle_hunt_duel (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    duel_id UUID NOT NULL REFERENCES duels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_word TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
    guesses INTEGER DEFAULT 0,
    final_score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one game per user per duel
    UNIQUE(duel_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_doodle_hunt_duel_duel_id ON doodle_hunt_duel(duel_id);
CREATE INDEX IF NOT EXISTS idx_doodle_hunt_duel_user_id ON doodle_hunt_duel(user_id);
CREATE INDEX IF NOT EXISTS idx_doodle_hunt_duel_status ON doodle_hunt_duel(status);

-- Create dedicated guesses table for duel mode
CREATE TABLE IF NOT EXISTS doodle_hunt_duel_guesses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES doodle_hunt_duel(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    guess_number INTEGER NOT NULL CHECK (guess_number >= 1 AND guess_number <= 5),
    target_word TEXT NOT NULL,
    ai_guess_word TEXT NOT NULL,
    similarity_score INTEGER NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_guess_per_duel_game UNIQUE (game_id, guess_number)
);

CREATE INDEX IF NOT EXISTS idx_duel_guesses_game_id ON doodle_hunt_duel_guesses(game_id);
CREATE INDEX IF NOT EXISTS idx_duel_guesses_user_id ON doodle_hunt_duel_guesses(user_id);

-- RPC function to create a doodle_hunt_duel game
CREATE OR REPLACE FUNCTION create_doodle_hunt_duel_game(
    duel_uuid UUID,
    user_uuid UUID,
    target_word_text TEXT
) RETURNS UUID AS $$
DECLARE
    game_uuid UUID;
BEGIN
    -- Insert new doodle_hunt_duel game
    INSERT INTO doodle_hunt_duel (duel_id, user_id, target_word, status)
    VALUES (duel_uuid, user_uuid, target_word_text, 'in_progress')
    RETURNING id INTO game_uuid;
    
    RETURN game_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to add a guess to doodle_hunt_duel
CREATE OR REPLACE FUNCTION add_doodle_hunt_duel_guess(
    game_uuid UUID,
    guess_num INTEGER,
    target_word_text TEXT,
    ai_guess_text TEXT,
    similarity_num INTEGER
) RETURNS UUID AS $$
DECLARE
    guess_uuid UUID;
    user_uuid UUID;
BEGIN
    -- Current user
    user_uuid := auth.uid();
    IF user_uuid IS NULL THEN
      RAISE EXCEPTION 'User must be authenticated to add a guess';
    END IF;

    -- Verify the game belongs to the current user
    IF NOT EXISTS (
      SELECT 1 FROM doodle_hunt_duel WHERE id = game_uuid AND user_id = user_uuid
    ) THEN
      RAISE EXCEPTION 'Game not found or not authorized';
    END IF;

    -- Add guess to duel guesses table
    INSERT INTO doodle_hunt_duel_guesses (game_id, user_id, guess_number, target_word, ai_guess_word, similarity_score)
    VALUES (game_uuid, user_uuid, guess_num, target_word_text, ai_guess_text, similarity_num)
    RETURNING id INTO guess_uuid;
    
    -- Update guesses count in doodle_hunt_duel
    UPDATE doodle_hunt_duel 
    SET guesses = guess_num, updated_at = NOW()
    WHERE id = game_uuid;
    
    RETURN guess_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to complete a doodle_hunt_duel game
CREATE OR REPLACE FUNCTION complete_doodle_hunt_duel_game(
    game_uuid UUID,
    game_status TEXT,
    final_score_num INTEGER DEFAULT 0
) RETURNS VOID AS $$
DECLARE
    duel_uuid UUID;
    user_uuid UUID;
    opponent_game_id UUID;
    challenger_score INTEGER;
    opponent_score INTEGER;
    winner_id UUID;
BEGIN
    -- Get duel_id and user_id from the game
    SELECT duel_id, user_id INTO duel_uuid, user_uuid
    FROM doodle_hunt_duel 
    WHERE id = game_uuid;
    
    -- Update the game status and final score
    UPDATE doodle_hunt_duel 
    SET status = game_status, final_score = final_score_num, updated_at = NOW()
    WHERE id = game_uuid;
    
    -- Check if both players have completed their games
    IF game_status = 'completed' THEN
        -- Get the opponent's game
        SELECT id INTO opponent_game_id
        FROM doodle_hunt_duel 
        WHERE duel_id = duel_uuid AND user_id != user_uuid;
        
        -- Check if opponent's game is also completed
        IF EXISTS (
            SELECT 1 FROM doodle_hunt_duel 
            WHERE id = opponent_game_id AND status = 'completed'
        ) THEN
            -- Both games are complete, determine winner
            SELECT 
                (SELECT final_score FROM doodle_hunt_duel WHERE id = game_uuid),
                (SELECT final_score FROM doodle_hunt_duel WHERE id = opponent_game_id)
            INTO challenger_score, opponent_score;
            
            -- Determine winner (higher score wins, or first to complete if tied)
            IF challenger_score > opponent_score THEN
                winner_id := user_uuid;
            ELSIF opponent_score > challenger_score THEN
                SELECT user_id INTO winner_id FROM doodle_hunt_duel WHERE id = opponent_game_id;
            ELSE
                -- Tie - winner is whoever completed first (current user)
                winner_id := user_uuid;
            END IF;
            
            -- Update the duel with winner and completion
            UPDATE duels 
            SET 
                status = 'completed',
                winner_id = winner_id,
                updated_at = NOW()
            WHERE id = duel_uuid;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE doodle_hunt_duel ENABLE ROW LEVEL SECURITY;
ALTER TABLE doodle_hunt_duel_guesses ENABLE ROW LEVEL SECURITY;

-- RLS policies for doodle_hunt_duel
CREATE POLICY "Users can view their own doodle_hunt_duel games" ON doodle_hunt_duel
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own doodle_hunt_duel games" ON doodle_hunt_duel
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own doodle_hunt_duel games" ON doodle_hunt_duel
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for doodle_hunt_duel_guesses
CREATE POLICY "Users can view their own duel guesses" ON doodle_hunt_duel_guesses
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own duel guesses" ON doodle_hunt_duel_guesses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Grant necessary permissions
GRANT ALL ON doodle_hunt_duel TO authenticated;
GRANT EXECUTE ON FUNCTION create_doodle_hunt_duel_game TO authenticated;
GRANT EXECUTE ON FUNCTION add_doodle_hunt_duel_guess TO authenticated;
GRANT EXECUTE ON FUNCTION complete_doodle_hunt_duel_game TO authenticated;
