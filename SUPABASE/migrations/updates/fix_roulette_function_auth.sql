-- Consolidated Roulette function auth fixes
-- This migration fixes auth context issues by adding user_id parameters
-- Replaces: fix-roulette-with-user-param.sql, fix-submit-turn-function.sql

-- ============================================================================
-- STEP 1: Fix find_or_create_roulette_match with user_id parameter
-- ============================================================================

-- Drop existing versions
DROP FUNCTION IF EXISTS public.find_or_create_roulette_match(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.find_or_create_roulette_match(INTEGER, UUID) CASCADE;

-- Create new version with user_id parameter
-- This avoids auth.uid() issues in SECURITY DEFINER context
CREATE OR REPLACE FUNCTION public.find_or_create_roulette_match(
    max_players_count INTEGER DEFAULT 2,
    calling_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    result_match_id UUID,
    result_is_new_match BOOLEAN,
    result_secret_word TEXT,
    result_match_status TEXT
) 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
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
    
    -- Raise error if not authenticated
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Cleanup existing waiting matches for this user
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

    -- Find available match with same max_players setting
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

    -- Create new match if no available match found
    IF v_match_record.id IS NULL THEN
        v_is_new := TRUE;
        
        -- Select a random word
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

    -- Get next position number for this participant
    WITH existing_positions AS (
        SELECT p.turn_position
        FROM roulette_participants p
        WHERE p.match_id = v_match_id
    )
    SELECT COALESCE(MAX(ep.turn_position), -1) + 1
    INTO v_next_position
    FROM existing_positions ep;

    -- Insert participant (or do nothing if already exists)
    INSERT INTO roulette_participants (match_id, user_id, turn_position)
    VALUES (v_match_id, v_user_id, v_next_position)
    ON CONFLICT (match_id, user_id) DO NOTHING;

    -- Count current participants
    WITH current_participants AS (
        SELECT COUNT(*) as count
        FROM roulette_participants p
        WHERE p.match_id = v_match_id
    )
    SELECT cp.count INTO v_participant_count
    FROM current_participants cp;

    -- Start game if match is now full
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

    -- Return result
    RETURN QUERY 
    SELECT v_match_id, v_is_new, v_word, v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_or_create_roulette_match(INTEGER, UUID) TO authenticated;

-- ============================================================================
-- STEP 2: Fix submit_roulette_turn with user_id parameter
-- ============================================================================

-- Drop existing version
DROP FUNCTION IF EXISTS public.submit_roulette_turn(UUID, TEXT, JSONB, TEXT, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.submit_roulette_turn(UUID, TEXT, JSONB, TEXT, INTEGER, UUID) CASCADE;

-- Create new version with user_id parameter
CREATE OR REPLACE FUNCTION public.submit_roulette_turn(
    target_match_id UUID,
    svg_url TEXT,
    paths_json JSONB,
    ai_guess_text TEXT,
    similarity_num INTEGER,
    calling_user_id UUID DEFAULT NULL
)
RETURNS UUID 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
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
    
    -- Get current turn information
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

    -- Check if guess was correct (100% similarity or higher)
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

    -- Clean up temporary stroke data for this turn (no longer needed)
    DELETE FROM roulette_drawing_strokes
    WHERE match_id = target_match_id
    AND turn_number = v_turn_number;

    RETURN v_turn_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_roulette_turn(UUID, TEXT, JSONB, TEXT, INTEGER, UUID) TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================

SELECT 'Roulette functions updated with user_id parameter support!' AS result;

