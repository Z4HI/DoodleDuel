-- Fix ambiguous column reference in complete_doodle_hunt_duel_game function
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
    calculated_winner_id UUID;
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
            DECLARE
                challenger_guesses INTEGER;
                opponent_guesses INTEGER;
            BEGIN
                -- Get scores and guess counts for both players
                SELECT 
                    final_score, guesses
                INTO challenger_score, challenger_guesses
                FROM doodle_hunt_duel 
                WHERE id = game_uuid;
                
                SELECT 
                    final_score, guesses
                INTO opponent_score, opponent_guesses
                FROM doodle_hunt_duel 
                WHERE id = opponent_game_id;
                
                -- Determine winner based on:
                -- 1. Fewer guesses wins
                -- 2. If same guesses, higher score wins
                -- 3. If both equal, it's a tie (no winner)
                IF challenger_guesses < opponent_guesses THEN
                    calculated_winner_id := user_uuid;
                ELSIF opponent_guesses < challenger_guesses THEN
                    SELECT user_id INTO calculated_winner_id FROM doodle_hunt_duel WHERE id = opponent_game_id;
                ELSIF challenger_score > opponent_score THEN
                    calculated_winner_id := user_uuid;
                ELSIF opponent_score > challenger_score THEN
                    SELECT user_id INTO calculated_winner_id FROM doodle_hunt_duel WHERE id = opponent_game_id;
                ELSE
                    -- Tie - no winner
                    calculated_winner_id := NULL;
                END IF;
            END;
            
            -- Update the duel with winner and completion
            UPDATE duels 
            SET 
                status = 'completed',
                winner_id = calculated_winner_id,
                updated_at = NOW()
            WHERE id = duel_uuid;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
