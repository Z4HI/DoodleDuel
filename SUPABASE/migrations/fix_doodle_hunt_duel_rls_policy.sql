-- Fix RLS policy to allow players to see both games in a duel
-- Drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own doodle_hunt_duel games" ON doodle_hunt_duel;
DROP POLICY IF EXISTS "Users can view games in their duels" ON doodle_hunt_duel;

-- Create a new policy that allows users to see games in duels they participate in
CREATE POLICY "Users can view games in their duels" ON doodle_hunt_duel
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM duels 
            WHERE duels.id = doodle_hunt_duel.duel_id 
            AND (duels.challenger_id = auth.uid() OR duels.opponent_id = auth.uid())
        )
    );

-- Fix RLS policy for doodle_hunt_duel_guesses table
-- Drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own duel guesses" ON doodle_hunt_duel_guesses;
DROP POLICY IF EXISTS "Users can view guesses in their duels" ON doodle_hunt_duel_guesses;

-- Create a new policy that allows users to see guesses in duels they participate in
CREATE POLICY "Users can view guesses in their duels" ON doodle_hunt_duel_guesses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM doodle_hunt_duel 
            JOIN duels ON duels.id = doodle_hunt_duel.duel_id
            WHERE doodle_hunt_duel.id = doodle_hunt_duel_guesses.game_id
            AND (duels.challenger_id = auth.uid() OR duels.opponent_id = auth.uid())
        )
    );
