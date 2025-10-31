-- Add turn limit support to Doodle Hunt Friend duels
-- Always 2 players = 10 turns (5 each)

-- Update submit_doodle_hunt_friend_turn to work with turn limit
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

-- Update advance_doodle_hunt_friend_turn to check for turn limit
CREATE OR REPLACE FUNCTION advance_doodle_hunt_friend_turn(target_duel_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_turn_number INTEGER;
    v_highest_score INTEGER;
    v_winner_id UUID;
    v_max_turns INTEGER := 10; -- 2 players * 5 turns each
BEGIN
    -- Get current turn number
    SELECT roulette_turn_number
    INTO v_turn_number
    FROM duels
    WHERE id = target_duel_id;
    
    -- Check if we've reached the turn limit (10 turns)
    IF v_turn_number >= v_max_turns THEN
        -- Find the winner (highest similarity score across all turns)
        SELECT 
            similarity_score,
            user_id
        INTO v_highest_score, v_winner_id
        FROM doodle_hunt_friend_turns
        WHERE duel_id = target_duel_id
        ORDER BY similarity_score DESC, created_at ASC
        LIMIT 1;
        
        -- Complete the duel with the winner
        UPDATE duels
        SET status = 'completed',
            winner_id = v_winner_id,
            updated_at = NOW()
        WHERE id = target_duel_id;
        
        RETURN TRUE;
    END IF;
    
    -- Advance to next turn
    UPDATE duels
    SET current_turn_index = (current_turn_index + 1) % 2,
        roulette_turn_number = roulette_turn_number + 1,
        turn_start_time = NOW()
    WHERE id = target_duel_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION submit_doodle_hunt_friend_turn(UUID, TEXT, JSONB, TEXT, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION advance_doodle_hunt_friend_turn(UUID) TO authenticated;

