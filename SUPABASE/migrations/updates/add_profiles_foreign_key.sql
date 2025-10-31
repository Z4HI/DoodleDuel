-- Add foreign key relationship to profiles table for roulette_participants
-- This allows PostgREST to automatically join with profiles

-- First, check if profiles table has matching user IDs
-- The profiles.id should match auth.users.id (one-to-one relationship)

-- Add foreign key constraint with the specific name PostgREST is looking for
-- Note: This assumes your profiles table has 'id' column that references auth.users(id)

-- If the constraint already exists, drop it first
ALTER TABLE roulette_participants 
DROP CONSTRAINT IF EXISTS roulette_participants_user_id_fkey;

-- Add the foreign key pointing to profiles
-- This allows PostgREST to use this relationship for joins
ALTER TABLE roulette_participants
ADD CONSTRAINT roulette_participants_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Verify it was created
SELECT 
    'Foreign key added successfully!' as message,
    conname as constraint_name,
    conrelid::regclass as from_table,
    confrelid::regclass as to_table
FROM pg_constraint
WHERE conname = 'roulette_participants_user_id_fkey';

