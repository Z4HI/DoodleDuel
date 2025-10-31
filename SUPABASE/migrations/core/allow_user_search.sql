-- Allow users to search for other users' profiles for friend requests and duels
-- This policy allows authenticated users to view basic profile information of other users

CREATE POLICY "Users can search other profiles" ON public.profiles
  FOR SELECT USING (
    auth.role() = 'authenticated' AND 
    auth.uid() IS NOT NULL
  );

-- Grant additional permissions for searching
GRANT SELECT ON public.profiles TO authenticated;
