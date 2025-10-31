-- Verify roulette table names exist
SELECT 
    tablename,
    schemaname
FROM pg_tables
WHERE tablename LIKE 'roulette%'
ORDER BY tablename;

-- Check if realtime is enabled for these exact names
SELECT 
    tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename LIKE 'roulette%';

