-- Create Doodle Hunt Roulette Tables and Functions
-- This migration sets up the complete roulette game mode

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- Main roulette matches table
CREATE TABLE IF NOT EXISTS roulette_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    secret_word TEXT NOT NULL,
    difficulty TEXT DEFAULT 'easy',
    max_players INTEGER NOT NULL CHECK (max_players IN (2, 4)),
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled')),
    current_turn_index INTEGER DEFAULT 0,
    turn_order TEXT[] NOT NULL DEFAULT '{}', -- Array of user_ids in random order
    winner_id UUID REFERENCES auth.users(id),
    turn_number INTEGER DEFAULT 0,
    turn_start_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT valid_turn_index CHECK (current_turn_index >= 0)
);

-- Participants in roulette matches
CREATE TABLE IF NOT EXISTS roulette_participants (
    id SERIAL PRIMARY KEY,
    match_id UUID NOT NULL REFERENCES roulette_matches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    turn_position INTEGER NOT NULL CHECK (turn_position >= 0 AND turn_position < 4),
    is_active BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(match_id, user_id),
    UNIQUE(match_id, turn_position)
);

-- Turn history for each roulette match
CREATE TABLE IF NOT EXISTS roulette_turns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES roulette_matches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    turn_number INTEGER NOT NULL,
    drawing_paths JSONB, -- Store paths for replay (will be deleted after game)
    svg_url TEXT, -- URL to SVG in storage (will be deleted after game)
    ai_guess TEXT,
    similarity_score INTEGER DEFAULT 0 CHECK (similarity_score >= 0 AND similarity_score <= 100),
    was_correct BOOLEAN DEFAULT FALSE,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(match_id, turn_number)
);

-- Real-time drawing strokes (used during live drawing, deleted after turn)
CREATE TABLE IF NOT EXISTS roulette_drawing_strokes (
    id BIGSERIAL PRIMARY KEY,
    match_id UUID NOT NULL REFERENCES roulette_matches(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,
    stroke_data JSONB NOT NULL, -- { path, color, strokeWidth }
    stroke_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. INDEXES for better performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_roulette_matches_status ON roulette_matches(status);
CREATE INDEX IF NOT EXISTS idx_roulette_matches_created ON roulette_matches(created_at);
CREATE INDEX IF NOT EXISTS idx_roulette_participants_match ON roulette_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_roulette_participants_user ON roulette_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_roulette_turns_match ON roulette_turns(match_id);
CREATE INDEX IF NOT EXISTS idx_roulette_strokes_match_turn ON roulette_drawing_strokes(match_id, turn_number);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE roulette_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE roulette_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE roulette_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE roulette_drawing_strokes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for roulette_matches
CREATE POLICY "Users can view matches they're in"
    ON roulette_matches FOR SELECT
    USING (
        id IN (
            SELECT match_id FROM roulette_participants 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view waiting matches"
    ON roulette_matches FOR SELECT
    USING (status = 'waiting' AND max_players > (
        SELECT COUNT(*) FROM roulette_participants WHERE match_id = roulette_matches.id
    ));

-- RLS Policies for roulette_participants
CREATE POLICY "Users can view participants in their matches"
    ON roulette_participants FOR SELECT
    USING (
        match_id IN (
            SELECT match_id FROM roulette_participants 
            WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for roulette_turns
CREATE POLICY "Users can view turns in their matches"
    ON roulette_turns FOR SELECT
    USING (
        match_id IN (
            SELECT match_id FROM roulette_participants 
            WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for roulette_drawing_strokes
CREATE POLICY "Users can view strokes in their matches"
    ON roulette_drawing_strokes FOR SELECT
    USING (
        match_id IN (
            SELECT match_id FROM roulette_participants 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert strokes for their turn"
    ON roulette_drawing_strokes FOR INSERT
    WITH CHECK (
        match_id IN (
            SELECT rm.id FROM roulette_matches rm
            JOIN roulette_participants rp ON rp.match_id = rm.id
            WHERE rp.user_id = auth.uid()
            AND rm.turn_order[rm.current_turn_index + 1] = auth.uid()::text
            AND rm.status = 'in_progress'
        )
    );

-- ============================================================================
-- 4. DATABASE FUNCTIONS
-- ============================================================================

-- Function: Create or join a roulette match
CREATE OR REPLACE FUNCTION find_or_create_roulette_match(
    max_players_count INTEGER DEFAULT 2,
    calling_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    result_match_id UUID,
    result_is_new_match BOOLEAN,
    result_secret_word TEXT,
    result_match_status TEXT
) AS $$
DECLARE
    v_match_id UUID;
    v_is_new BOOLEAN := FALSE;
    v_word TEXT;
    v_status TEXT;
    v_participant_count INTEGER;
    v_user_id UUID;
    v_next_position INTEGER;
    v_match_record RECORD;
BEGIN
    -- Use parameter if provided, otherwise fall back to auth.uid()
    v_user_id := COALESCE(calling_user_id, auth.uid());
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Cleanup existing waiting matches
    WITH user_matches AS (
        SELECT p.match_id 
        FROM roulette_participants p
        WHERE p.user_id = v_user_id
    )
    UPDATE roulette_matches m
    SET status = 'cancelled'
    FROM user_matches um
    WHERE m.id = um.match_id
    AND m.status = 'waiting';

    -- Find available match
    WITH match_counts AS (
        SELECT 
            p.match_id,
            COUNT(*) as participant_count
        FROM roulette_participants p
        GROUP BY p.match_id
    )
    SELECT 
        m.id,
        m.secret_word,
        m.status
    INTO v_match_record
    FROM roulette_matches m
    LEFT JOIN match_counts mc ON m.id = mc.match_id
    WHERE m.status = 'waiting'
    AND m.max_players = max_players_count
    AND COALESCE(mc.participant_count, 0) < m.max_players
    ORDER BY m.created_at ASC
    LIMIT 1;

    -- Create new match if needed
    IF v_match_record.id IS NULL THEN
        v_is_new := TRUE;
        
        SELECT w.word INTO v_word
        FROM words w
        WHERE w.difficulty = 'easy'
        ORDER BY RANDOM()
        LIMIT 1;

        INSERT INTO roulette_matches (secret_word, max_players, status)
        VALUES (v_word, max_players_count, 'waiting')
        RETURNING id, secret_word, status
        INTO v_match_id, v_word, v_status;
    ELSE
        v_match_id := v_match_record.id;
        v_word := v_match_record.secret_word;
        v_status := v_match_record.status;
    END IF;

    -- Get next position
    WITH existing_positions AS (
        SELECT p.turn_position
        FROM roulette_participants p
        WHERE p.match_id = v_match_id
    )
    SELECT COALESCE(MAX(ep.turn_position), -1) + 1
    INTO v_next_position
    FROM existing_positions ep;

    -- Insert participant
    INSERT INTO roulette_participants (match_id, user_id, turn_position)
    VALUES (v_match_id, v_user_id, v_next_position)
    ON CONFLICT (match_id, user_id) DO NOTHING;

    -- Count participants
    WITH current_participants AS (
        SELECT COUNT(*) as count
        FROM roulette_participants p
        WHERE p.match_id = v_match_id
    )
    SELECT cp.count INTO v_participant_count
    FROM current_participants cp;

    -- Start game if full
    IF v_participant_count >= max_players_count THEN
        WITH participant_order AS (
            SELECT ARRAY_AGG(p.user_id::TEXT ORDER BY RANDOM()) as turn_arr
            FROM roulette_participants p
            WHERE p.match_id = v_match_id
        )
        UPDATE roulette_matches m
        SET 
            status = 'in_progress',
            turn_order = po.turn_arr,
            current_turn_index = 0,
            turn_number = 1,
            turn_start_time = NOW()
        FROM participant_order po
        WHERE m.id = v_match_id
        RETURNING m.status INTO v_status;
    END IF;

    RETURN QUERY SELECT v_match_id, v_is_new, v_word, v_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Leave a roulette match
CREATE OR REPLACE FUNCTION leave_roulette_match(
    target_match_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_status TEXT;
    v_participant_count INTEGER;
BEGIN
    -- Get match status
    SELECT status INTO v_status
    FROM roulette_matches
    WHERE id = target_match_id;

    -- If match is waiting, remove participant
    IF v_status = 'waiting' THEN
        DELETE FROM roulette_participants
        WHERE match_id = target_match_id
        AND user_id = auth.uid();

        -- Check if match is now empty
        SELECT COUNT(*) INTO v_participant_count
        FROM roulette_participants
        WHERE match_id = target_match_id;

        -- If empty, delete the match
        IF v_participant_count = 0 THEN
            DELETE FROM roulette_matches WHERE id = target_match_id;
        END IF;

        RETURN TRUE;
    
    -- If match is in progress, mark player as inactive
    ELSIF v_status = 'in_progress' THEN
        UPDATE roulette_participants
        SET is_active = FALSE
        WHERE match_id = target_match_id
        AND user_id = auth.uid();

        -- Check if all players left
        SELECT COUNT(*) INTO v_participant_count
        FROM roulette_participants
        WHERE match_id = target_match_id
        AND is_active = TRUE;

        -- If all left, cancel the match
        IF v_participant_count = 0 THEN
            UPDATE roulette_matches
            SET status = 'cancelled',
                completed_at = NOW()
            WHERE id = target_match_id;
        END IF;

        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Submit a turn drawing
CREATE OR REPLACE FUNCTION submit_roulette_turn(
    target_match_id UUID,
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
        turn_number,
        EXTRACT(EPOCH FROM (NOW() - turn_start_time))::INTEGER
    INTO v_expected_user, v_turn_number, v_duration
    FROM roulette_matches
    WHERE id = target_match_id;

    -- Verify it's this user's turn
    IF v_expected_user != v_current_user::TEXT THEN
        RAISE EXCEPTION 'Not your turn. Expected: %, Got: %', v_expected_user, v_current_user::TEXT;
    END IF;

    -- Check if guess was correct
    v_was_correct := similarity_num >= 100;

    -- Insert turn record
    INSERT INTO roulette_turns (
        match_id,
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
        target_match_id,
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
    DELETE FROM roulette_drawing_strokes
    WHERE match_id = target_match_id
    AND turn_number = v_turn_number;

    RETURN v_turn_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Advance to next turn
CREATE OR REPLACE FUNCTION advance_roulette_turn(
    target_match_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_max_players INTEGER;
    v_current_index INTEGER;
    v_turn_number INTEGER;
BEGIN
    -- Get match info
    SELECT max_players, current_turn_index, turn_number
    INTO v_max_players, v_current_index, v_turn_number
    FROM roulette_matches
    WHERE id = target_match_id;

    -- Advance to next turn
    UPDATE roulette_matches
    SET current_turn_index = (current_turn_index + 1) % max_players,
        turn_number = turn_number + 1,
        turn_start_time = NOW()
    WHERE id = target_match_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Complete a roulette match
CREATE OR REPLACE FUNCTION complete_roulette_match(
    target_match_id UUID,
    winner_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Update match status
    UPDATE roulette_matches
    SET status = 'completed',
        winner_id = winner_user_id,
        completed_at = NOW()
    WHERE id = target_match_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get match status with participants
CREATE OR REPLACE FUNCTION get_roulette_match_status(
    target_match_id UUID
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'match', (
            SELECT row_to_json(rm.*)
            FROM roulette_matches rm
            WHERE rm.id = target_match_id
        ),
        'participants', (
            SELECT json_agg(
                json_build_object(
                    'user_id', rp.user_id,
                    'turn_position', rp.turn_position,
                    'is_active', rp.is_active,
                    'username', p.username
                )
            )
            FROM roulette_participants rp
            JOIN profiles p ON p.id = rp.user_id
            WHERE rp.match_id = target_match_id
            ORDER BY rp.turn_position
        ),
        'turns', (
            SELECT json_agg(
                row_to_json(rt.*)
            )
            FROM roulette_turns rt
            WHERE rt.match_id = target_match_id
            ORDER BY rt.turn_number
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Cleanup match data after game ends (delete SVGs and paths)
CREATE OR REPLACE FUNCTION cleanup_roulette_match(
    target_match_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Delete all drawing strokes
    DELETE FROM roulette_drawing_strokes
    WHERE match_id = target_match_id;

    -- Clear SVG URLs and drawing paths from turns
    UPDATE roulette_turns
    SET drawing_paths = NULL,
        svg_url = NULL
    WHERE match_id = target_match_id;

    -- Note: Actual SVG file deletion from storage must be done by the application/edge function
    -- because we can't directly access storage from SQL

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. GRANT PERMISSIONS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON roulette_matches TO authenticated;
GRANT ALL ON roulette_participants TO authenticated;
GRANT ALL ON roulette_turns TO authenticated;
GRANT ALL ON roulette_drawing_strokes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE roulette_participants_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE roulette_drawing_strokes_id_seq TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION find_or_create_roulette_match(INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION leave_roulette_match TO authenticated;
GRANT EXECUTE ON FUNCTION submit_roulette_turn(UUID, TEXT, JSONB, TEXT, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION advance_roulette_turn TO authenticated;
GRANT EXECUTE ON FUNCTION complete_roulette_match TO authenticated;
GRANT EXECUTE ON FUNCTION get_roulette_match_status TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_roulette_match TO authenticated;

