-- Add automatic XP awarding when roulette matches complete
-- This ensures users get XP even if they close the app before seeing results

-- Function to award XP automatically when roulette match completes
CREATE OR REPLACE FUNCTION award_roulette_xp_automatically(
    target_match_id UUID
)
RETURNS VOID AS $$
DECLARE
    match_record RECORD;
    participant_record RECORD;
    xp_amount INTEGER;
    won BOOLEAN;
BEGIN
    -- Get match details
    SELECT * INTO match_record
    FROM roulette_matches
    WHERE id = target_match_id AND status = 'completed';
    
    IF NOT FOUND THEN
        RETURN; -- Match not found or not completed
    END IF;
    
    -- Award XP to each participant
    FOR participant_record IN 
        SELECT user_id, is_active
        FROM roulette_participants
        WHERE match_id = target_match_id
    LOOP
        -- Determine if this participant won
        won := (match_record.winner_id = participant_record.user_id);
        
        -- Calculate XP amount based on match type and result
        IF match_record.max_players = 4 THEN
            xp_amount := CASE 
                WHEN won THEN 200 -- roulette_4p_win
                ELSE 50          -- roulette_4p_loss
            END;
        ELSE
            xp_amount := CASE 
                WHEN won THEN 150 -- roulette_2p_win
                ELSE 40           -- roulette_2p_loss
            END;
        END IF;
        
        -- Award XP using the existing award_xp function
        PERFORM award_xp(
            participant_record.user_id,
            xp_amount,
            CASE WHEN match_record.max_players = 4 THEN 'roulette_4p' ELSE 'roulette_2p' END,
            CASE WHEN won THEN 'win' ELSE 'loss' END
        );
        
        RAISE NOTICE 'Awarded % XP to user % for roulette match %', 
            xp_amount, participant_record.user_id, target_match_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the complete_roulette_match function to automatically award XP
CREATE OR REPLACE FUNCTION complete_roulette_match(
    target_match_id UUID,
    winner_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_participant_count INTEGER;
    v_winner_id UUID;
    v_verify_winner_id UUID;
BEGIN
    -- Get current match status and participant count
    SELECT COUNT(*) INTO v_participant_count
    FROM roulette_participants
    WHERE match_id = target_match_id AND is_active = TRUE;
    
    -- If no active participants, set winner to NULL
    IF v_participant_count = 0 THEN
        v_winner_id := NULL;
    ELSE
        v_winner_id := winner_user_id;
    END IF;
    
    RAISE NOTICE 'Completing match % with winner: % (participant_count: %)', target_match_id, v_winner_id, v_participant_count;

    -- Update match status to completed
    UPDATE roulette_matches
    SET status = 'completed',
        winner_id = v_winner_id,
        completed_at = NOW()
    WHERE id = target_match_id;

    RAISE NOTICE 'Match % updated with winner_id: %', target_match_id, v_winner_id;
    
    -- Verify the winner_id was properly set
    SELECT winner_id INTO v_verify_winner_id
    FROM roulette_matches
    WHERE id = target_match_id;
    
    IF v_verify_winner_id IS NULL THEN
        RAISE WARNING 'Winner ID was not properly set for match %', target_match_id;
    ELSE
        RAISE NOTICE 'Winner ID verified for match %: %', target_match_id, v_verify_winner_id;
    END IF;
    
    -- Automatically award XP to all participants
    PERFORM award_roulette_xp_automatically(target_match_id);
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update submit_roulette_turn to handle duplicate submissions gracefully
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

    -- Insert turn record with ON CONFLICT to handle duplicate submissions
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
    ON CONFLICT (match_id, turn_number) 
    DO UPDATE SET
        user_id = EXCLUDED.user_id,
        drawing_paths = EXCLUDED.drawing_paths,
        svg_url = EXCLUDED.svg_url,
        ai_guess = EXCLUDED.ai_guess,
        similarity_score = EXCLUDED.similarity_score,
        was_correct = EXCLUDED.was_correct,
        duration_seconds = EXCLUDED.duration_seconds
    RETURNING id INTO v_turn_id;

    -- Delete stroke data for this turn (no longer needed)
    DELETE FROM roulette_drawing_strokes
    WHERE match_id = target_match_id
    AND turn_number = v_turn_number;

    RETURN v_turn_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the advance_roulette_turn function to use the new complete_roulette_match function
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
    v_new_index INTEGER;
    v_new_turn_number INTEGER;
BEGIN
    -- Get match info
    SELECT max_players, current_turn_index, turn_number
    INTO v_max_players, v_current_index, v_turn_number
    FROM roulette_matches
    WHERE id = target_match_id;

    RAISE NOTICE 'Advancing turn for match %: current_index=%, turn_number=%, max_players=%', 
        target_match_id, v_current_index, v_turn_number, v_max_players;

    -- Calculate max turns (5 turns per player)
    v_max_turns := v_max_players * 5;

    -- Check if we've reached the turn limit
    IF v_turn_number >= v_max_turns THEN
        RAISE NOTICE 'Turn limit reached (% >= %), finding winner', v_turn_number, v_max_turns;
        
        -- Find the winner (highest similarity score)
        SELECT 
            similarity_score,
            user_id
        INTO v_highest_score, v_winner_id
        FROM roulette_turns
        WHERE match_id = target_match_id
        ORDER BY similarity_score DESC, created_at ASC
        LIMIT 1;

        RAISE NOTICE 'Winner found: user_id=%, score=%', v_winner_id, v_highest_score;

        -- Complete the match with automatic XP awarding
        PERFORM complete_roulette_match(target_match_id, v_winner_id);
        
        RAISE NOTICE 'Match completed with winner: %', v_winner_id;

        RETURN TRUE;
    END IF;

    -- Calculate new turn index and number
    v_new_index := (v_current_index + 1) % v_max_players;
    v_new_turn_number := v_turn_number + 1;

    RAISE NOTICE 'Advancing turn: % -> % (index), % -> % (turn_number)', 
        v_current_index, v_new_index, v_turn_number, v_new_turn_number;

    -- Advance to next turn
    UPDATE roulette_matches
    SET current_turn_index = v_new_index,
        turn_number = v_new_turn_number,
        turn_start_time = NOW()
    WHERE id = target_match_id;

    RAISE NOTICE 'Turn advanced successfully for match %', target_match_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION award_roulette_xp_automatically(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_roulette_match(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION advance_roulette_turn(UUID) TO authenticated;
