-- Check if realtime is broadcasting at all

-- Check realtime publication
SELECT 
    pubname,
    tablename,
    schemaname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename LIKE 'roulette%';

-- Check if there's a replica identity issue
SELECT 
    c.relname as tablename,
    CASE c.relreplident
        WHEN 'd' THEN 'default (primary key)'
        WHEN 'n' THEN 'nothing (REALTIME WONT WORK!)'
        WHEN 'f' THEN 'full'
        WHEN 'i' THEN 'index'
    END as replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
AND c.relname LIKE 'roulette%';

-- If replica identity is 'nothing', realtime won't broadcast changes!
-- Fix it with:
-- ALTER TABLE roulette_matches REPLICA IDENTITY FULL;
-- ALTER TABLE roulette_participants REPLICA IDENTITY FULL;
