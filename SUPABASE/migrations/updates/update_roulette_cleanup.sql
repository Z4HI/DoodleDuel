-- Update roulette cleanup to track when players have viewed results

-- Add column to track if participant has viewed results
ALTER TABLE roulette_participants 
  ADD COLUMN IF NOT EXISTS viewed_results BOOLEAN DEFAULT FALSE;

-- Function to mark that a player has viewed results
CREATE OR REPLACE FUNCTION mark_roulette_results_viewed(
    target_match_id UUID,
    calling_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := COALESCE(calling_user_id, auth.uid());
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Mark results as viewed
    UPDATE roulette_participants
    SET viewed_results = TRUE
    WHERE match_id = target_match_id
    AND user_id = v_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced cleanup function - only cleans if ALL players have viewed results
CREATE OR REPLACE FUNCTION cleanup_roulette_match(
    target_match_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_all_viewed BOOLEAN;
    v_participant_count INTEGER;
    v_viewed_count INTEGER;
BEGIN
    -- Check if all participants have viewed results
    SELECT COUNT(*) INTO v_participant_count
    FROM roulette_participants
    WHERE match_id = target_match_id;
    
    SELECT COUNT(*) INTO v_viewed_count
    FROM roulette_participants
    WHERE match_id = target_match_id
    AND viewed_results = TRUE;
    
    -- Only cleanup if everyone has viewed (or if no participants remain)
    IF v_viewed_count >= v_participant_count OR v_participant_count = 0 THEN
        -- Delete all drawing strokes
        DELETE FROM roulette_drawing_strokes
        WHERE match_id = target_match_id;

        -- Delete all turns
        DELETE FROM roulette_turns
        WHERE match_id = target_match_id;

        -- Delete all participants
        DELETE FROM roulette_participants
        WHERE match_id = target_match_id;
        
        RAISE NOTICE 'Cleanup completed for match %', target_match_id;
        RETURN TRUE;
    ELSE
        RAISE NOTICE 'Not all players have viewed results yet (% / % viewed)', v_viewed_count, v_participant_count;
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION mark_roulette_results_viewed(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_roulette_match(UUID) TO authenticated;

-- Add a function to fully delete the match (if needed later)
CREATE OR REPLACE FUNCTION delete_roulette_match_completely(
    target_match_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Delete in order due to foreign key constraints
    DELETE FROM roulette_drawing_strokes WHERE match_id = target_match_id;
    DELETE FROM roulette_turns WHERE match_id = target_match_id;
    DELETE FROM roulette_participants WHERE match_id = target_match_id;
    DELETE FROM roulette_matches WHERE id = target_match_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION delete_roulette_match_completely(UUID) TO authenticated;

