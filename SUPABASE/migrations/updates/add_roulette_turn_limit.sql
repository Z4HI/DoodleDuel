-- Add turn limit support to roulette matches
-- 2 players = 10 turns (5 each), 4 players = 20 turns (5 each)

-- Update submit_roulette_turn to check for turn limit and end game
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

-- Update advance_roulette_turn to check for turn limit
CREATE OR REPLACE FUNCTION advance_roulette_turn(
    target_match_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_max_players INTEGER;
    v_current_index INTEGER;
    v_turn_number INTEGER;
    v_max_turns INTEGER;
    v_highest_score INTEGER;
    v_winner_id UUID;
BEGIN
    -- Get match info
    SELECT max_players, current_turn_index, turn_number
    INTO v_max_players, v_current_index, v_turn_number
    FROM roulette_matches
    WHERE id = target_match_id;

    -- Calculate max turns (5 turns per player)
    v_max_turns := v_max_players * 5;

    -- Check if we've reached the turn limit
    IF v_turn_number >= v_max_turns THEN
        -- Find the winner (highest similarity score)
        SELECT 
            MAX(similarity_score),
            user_id
        INTO v_highest_score, v_winner_id
        FROM roulette_turns
        WHERE match_id = target_match_id
        ORDER BY similarity_score DESC, created_at ASC
        LIMIT 1;

        -- Complete the match with the winner
        UPDATE roulette_matches
        SET status = 'completed',
            winner_id = v_winner_id,
            completed_at = NOW()
        WHERE id = target_match_id;

        RETURN TRUE;
    END IF;

    -- Advance to next turn
    UPDATE roulette_matches
    SET current_turn_index = (current_turn_index + 1) % max_players,
        turn_number = turn_number + 1,
        turn_start_time = NOW()
    WHERE id = target_match_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION submit_roulette_turn(UUID, TEXT, JSONB, TEXT, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION advance_roulette_turn(UUID) TO authenticated;

