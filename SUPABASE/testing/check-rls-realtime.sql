-- Check current RLS policies on roulette_matches
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'roulette_matches';

-- Show if RLS is enabled
SELECT 
    tablename,
    CASE 
        WHEN rowsecurity THEN 'RLS ENABLED'
        ELSE 'RLS DISABLED'
    END as rls_status
FROM pg_tables
WHERE tablename = 'roulette_matches';

