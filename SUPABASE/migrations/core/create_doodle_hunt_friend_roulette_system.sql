-- Create Doodle Hunt Friend Roulette System
-- This migration converts Play a Friend Doodle Hunt to match 2-player multiplayer roulette
-- Uses the duels table but with turn-based roulette gameplay

-- ============================================================================
-- 1. NEW TABLES
-- ============================================================================

-- Turn history for Doodle Hunt Friend matches (using duel_id instead of match_id)
CREATE TABLE IF NOT EXISTS doodle_hunt_friend_turns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    duel_id UUID NOT NULL REFERENCES duels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    turn_number INTEGER NOT NULL,
    drawing_paths JSONB, -- Store paths for replay (will be deleted after game)
    svg_url TEXT, -- URL to SVG in storage (will be deleted after game)
    ai_guess TEXT,
    similarity_score INTEGER DEFAULT 0 CHECK (similarity_score >= 0 AND similarity_score <= 100),
    was_correct BOOLEAN DEFAULT FALSE,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(duel_id, turn_number)
);

-- Real-time drawing strokes (used during live drawing, deleted after turn)
CREATE TABLE IF NOT EXISTS doodle_hunt_friend_strokes (
    id BIGSERIAL PRIMARY KEY,
    duel_id UUID NOT NULL REFERENCES duels(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,
    stroke_data JSONB NOT NULL, -- { path, color, strokeWidth }
    stroke_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. ALTER DUELS TABLE
-- ============================================================================

-- Add turn-based fields to duels table for Doodle Hunt friend mode
ALTER TABLE duels ADD COLUMN IF NOT EXISTS current_turn_index INTEGER DEFAULT 0;
ALTER TABLE duels ADD COLUMN IF NOT EXISTS turn_order TEXT[] DEFAULT '{}'; -- Array of user_ids in turn order
ALTER TABLE duels ADD COLUMN IF NOT EXISTS roulette_turn_number INTEGER DEFAULT 0;
ALTER TABLE duels ADD COLUMN IF NOT EXISTS turn_start_time TIMESTAMPTZ;

-- Add constraint for valid turn index
ALTER TABLE duels DROP CONSTRAINT IF EXISTS valid_turn_index;
ALTER TABLE duels ADD CONSTRAINT valid_turn_index CHECK (
    (gamemode != 'doodleHunt') OR (current_turn_index >= 0 AND current_turn_index < 2)
);

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_doodle_hunt_friend_turns_duel ON doodle_hunt_friend_turns(duel_id);
CREATE INDEX IF NOT EXISTS idx_doodle_hunt_friend_turns_user ON doodle_hunt_friend_turns(user_id);
CREATE INDEX IF NOT EXISTS idx_doodle_hunt_friend_strokes_duel_turn ON doodle_hunt_friend_strokes(duel_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_duels_turn_order ON duels USING GIN(turn_order);

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE doodle_hunt_friend_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE doodle_hunt_friend_strokes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for doodle_hunt_friend_turns
CREATE POLICY "Users can view turns in their duels"
    ON doodle_hunt_friend_turns FOR SELECT
    USING (
        duel_id IN (
            SELECT id FROM duels 
            WHERE challenger_id = auth.uid() OR opponent_id = auth.uid()
        )
    );

-- RLS Policies for doodle_hunt_friend_strokes
CREATE POLICY "Users can view strokes in their duels"
    ON doodle_hunt_friend_strokes FOR SELECT
    USING (
        duel_id IN (
            SELECT id FROM duels 
            WHERE challenger_id = auth.uid() OR opponent_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert strokes for their turn"
    ON doodle_hunt_friend_strokes FOR INSERT
    WITH CHECK (
        duel_id IN (
            SELECT d.id FROM duels d
            WHERE (d.challenger_id = auth.uid() OR d.opponent_id = auth.uid())
            AND d.turn_order[d.current_turn_index + 1] = auth.uid()::text
            AND d.status = 'in_progress'
            AND d.gamemode = 'doodleHunt'
        )
    );

-- ============================================================================
-- 5. DATABASE FUNCTIONS
-- ============================================================================

-- Function: Initialize turn order for a Doodle Hunt duel (called when both players accept)
CREATE OR REPLACE FUNCTION initialize_doodle_hunt_duel_turns(target_duel_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_challenger_id UUID;
    v_opponent_id UUID;
    v_turn_order TEXT[];
BEGIN
    -- Get duel participants
    SELECT challenger_id, opponent_id
    INTO v_challenger_id, v_opponent_id
    FROM duels
    WHERE id = target_duel_id
    AND gamemode = 'doodleHunt';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Duel not found or not a Doodle Hunt duel';
    END IF;
    
    -- Randomly assign turn order
    IF RANDOM() < 0.5 THEN
        v_turn_order := ARRAY[v_challenger_id::TEXT, v_opponent_id::TEXT];
    ELSE
        v_turn_order := ARRAY[v_opponent_id::TEXT, v_challenger_id::TEXT];
    END IF;
    
    -- Update duel with turn order
    UPDATE duels
    SET turn_order = v_turn_order,
        current_turn_index = 0,
        roulette_turn_number = 1,
        turn_start_time = NOW()
    WHERE id = target_duel_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Submit a turn drawing for Doodle Hunt Friend
CREATE OR REPLACE FUNCTION submit_doodle_hunt_friend_turn(
    target_duel_id UUID,
    svg_url TEXT,
    paths_json JSONB,
    ai_guess_text TEXT,
    similarity_num INTEGER,
    calling_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_turn_id UUID;
    v_current_user UUID;
    v_expected_user TEXT;
    v_turn_number INTEGER;
    v_duration INTEGER;
    v_was_correct BOOLEAN;
BEGIN
    -- Use parameter if provided, otherwise fall back to auth.uid()
    v_current_user := COALESCE(calling_user_id, auth.uid());
    
    IF v_current_user IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Get current turn info
    SELECT 
        turn_order[current_turn_index + 1],
        roulette_turn_number,
        EXTRACT(EPOCH FROM (NOW() - turn_start_time))::INTEGER
    INTO v_expected_user, v_turn_number, v_duration
    FROM duels
    WHERE id = target_duel_id;
    
    -- Verify it's this user's turn
    IF v_expected_user != v_current_user::TEXT THEN
        RAISE EXCEPTION 'Not your turn. Expected: %, Got: %', v_expected_user, v_current_user::TEXT;
    END IF;
    
    -- Check if guess was correct (100% = win)
    v_was_correct := similarity_num >= 100;
    
    -- Insert turn record
    INSERT INTO doodle_hunt_friend_turns (
        duel_id,
        user_id,
        turn_number,
        drawing_paths,
        svg_url,
        ai_guess,
        similarity_score,
        was_correct,
        duration_seconds
    )
    VALUES (
        target_duel_id,
        v_current_user,
        v_turn_number,
        paths_json,
        svg_url,
        ai_guess_text,
        similarity_num,
        v_was_correct,
        v_duration
    )
    RETURNING id INTO v_turn_id;
    
    -- Delete stroke data for this turn (no longer needed)
    DELETE FROM doodle_hunt_friend_strokes
    WHERE duel_id = target_duel_id
    AND turn_number = v_turn_number;
    
    RETURN v_turn_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Advance to next turn for Doodle Hunt Friend
CREATE OR REPLACE FUNCTION advance_doodle_hunt_friend_turn(target_duel_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Advance to next turn (alternate between 2 players)
    UPDATE duels
    SET current_turn_index = (current_turn_index + 1) % 2,
        roulette_turn_number = roulette_turn_number + 1,
        turn_start_time = NOW()
    WHERE id = target_duel_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Complete a Doodle Hunt Friend match when someone wins
CREATE OR REPLACE FUNCTION complete_doodle_hunt_friend_match(
    target_duel_id UUID,
    winner_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Update duel status
    UPDATE duels
    SET status = 'completed',
        winner_id = winner_user_id,
        updated_at = NOW()
    WHERE id = target_duel_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get duel status with turn data
CREATE OR REPLACE FUNCTION get_doodle_hunt_friend_status(target_duel_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'duel', (
            SELECT row_to_json(d.*)
            FROM duels d
            WHERE d.id = target_duel_id
        ),
        'turns', (
            SELECT json_agg(
                row_to_json(dhft.*)
            )
            FROM doodle_hunt_friend_turns dhft
            WHERE dhft.duel_id = target_duel_id
            ORDER BY dhft.turn_number
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Cleanup duel data after game ends
CREATE OR REPLACE FUNCTION cleanup_doodle_hunt_friend_duel(target_duel_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Delete all drawing strokes
    DELETE FROM doodle_hunt_friend_strokes
    WHERE duel_id = target_duel_id;
    
    -- Clear SVG URLs and drawing paths from turns
    UPDATE doodle_hunt_friend_turns
    SET drawing_paths = NULL,
        svg_url = NULL
    WHERE duel_id = target_duel_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. UPDATE ACCEPT DUEL FUNCTION
-- ============================================================================

-- Update the accept_duel function to initialize turn order for Doodle Hunt
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
    WHERE id = duel_uuid;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Duel not found';
    END IF;
    
    -- Verify it's the opponent accepting
    IF duel_record.opponent_id != auth.uid() THEN
        RAISE EXCEPTION 'Only the opponent can accept this duel';
    END IF;
    
    -- Verify duel status
    IF duel_record.status != 'duel_sent' THEN
        RAISE EXCEPTION 'Duel is not in sent status';
    END IF;
    
    -- Accept the duel
    UPDATE public.duels
    SET status = 'in_progress',
        accepted = TRUE,
        updated_at = NOW()
    WHERE id = duel_uuid;
    
    -- If it's a Doodle Hunt duel, initialize turn order
    IF duel_record.gamemode = 'doodleHunt' THEN
        PERFORM initialize_doodle_hunt_duel_turns(duel_uuid);
    END IF;
END;
$$;

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON doodle_hunt_friend_turns TO authenticated;
GRANT ALL ON doodle_hunt_friend_strokes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE doodle_hunt_friend_strokes_id_seq TO authenticated;

GRANT EXECUTE ON FUNCTION initialize_doodle_hunt_duel_turns TO authenticated;
GRANT EXECUTE ON FUNCTION submit_doodle_hunt_friend_turn TO authenticated;
GRANT EXECUTE ON FUNCTION advance_doodle_hunt_friend_turn TO authenticated;
GRANT EXECUTE ON FUNCTION complete_doodle_hunt_friend_match TO authenticated;
GRANT EXECUTE ON FUNCTION get_doodle_hunt_friend_status TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_doodle_hunt_friend_duel TO authenticated;
GRANT EXECUTE ON FUNCTION accept_duel TO authenticated;

