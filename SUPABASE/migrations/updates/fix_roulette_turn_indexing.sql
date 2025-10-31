-- Fix roulette turn indexing issue
-- The database was using current_turn_index + 1 but should use current_turn_index + 1 for PostgreSQL arrays
-- However, the real issue is that we need to ensure consistency between frontend and backend

-- Update submit_roulette_turn to use correct array indexing
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
    v_max_players INTEGER;
    v_max_turns INTEGER;
BEGIN
    -- Use parameter if provided, otherwise fall back to auth.uid()
    v_current_user := COALESCE(calling_user_id, auth.uid());
    
    IF v_current_user IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Get current turn info and max players
    -- Note: We're using 0-based indexing to match the frontend
    -- When current_turn_index = 0, we want turn_order[1] (first element in PostgreSQL)
    -- When current_turn_index = 1, we want turn_order[2] (second element in PostgreSQL)
    SELECT 
        turn_order[current_turn_index + 1],
        turn_number,
        EXTRACT(EPOCH FROM (NOW() - turn_start_time))::INTEGER,
        max_players
    INTO v_expected_user, v_turn_number, v_duration, v_max_players
    FROM roulette_matches
    WHERE id = target_match_id;

    -- Verify it's this user's turn
    IF v_expected_user != v_current_user::TEXT THEN
        RAISE EXCEPTION 'Not your turn. Expected: %, Got: %', v_expected_user, v_current_user::TEXT;
    END IF;

    -- Calculate max turns (5 turns per player)
    v_max_turns := v_max_players * 5;

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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION submit_roulette_turn(UUID, TEXT, JSONB, TEXT, INTEGER, UUID) TO authenticated;
