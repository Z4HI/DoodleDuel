-- Temporarily disable RLS to test if that's blocking realtime
-- We'll re-enable with better policies later

ALTER TABLE roulette_matches DISABLE ROW LEVEL SECURITY;
ALTER TABLE roulette_participants DISABLE ROW LEVEL SECURITY;

SELECT 'RLS temporarily disabled for testing. Try now!' AS result;

-- To re-enable later:
-- ALTER TABLE roulette_matches ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE roulette_participants ENABLE ROW LEVEL SECURITY;

