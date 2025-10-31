# Multiplayer Leave Match Fix

## Problem
When a user leaves a multiplayer match and tries to search again, they get an error:
```
Error joining match: {
  code: "P0001",
  details: null,
  hint: null,
  message: "User is already in this match"
}
```

This happens because the user remains in the `match_participants` table even after navigating away from the screen.

## Solution
Implemented automatic cleanup of waiting matches when users leave the multiplayer screen or click back to home.

## Changes Made

### 1. Database Migration (`SUPABASE/migrations/add_leave_match_function.sql`)
Created two new database functions:

#### `leave_match(target_match_id UUID)`
- Removes the current user from a specific match
- Only works if the match is in "waiting" status (not active or completed)
- Automatically deletes empty matches (matches with no participants)
- Uses `SECURITY DEFINER` to run with elevated privileges

#### `cleanup_user_waiting_matches()`
- Removes the current user from ALL waiting matches
- Cleans up any empty waiting matches
- Called before searching for a new match to ensure clean state

#### RLS Policy
- Added DELETE policy on `match_participants` table to allow users to remove their own participation

### 2. Edge Function Updates (`SUPABASE/functions/matchmaking/index.ts`)
Added two new action handlers:

- **`leave_match`**: Calls the `leave_match()` database function
- **`cleanup_waiting_matches`**: Calls the `cleanup_user_waiting_matches()` database function

### 3. Frontend Updates (`SCREENS/MultiplayerScreen.tsx`)

#### Before Finding a Match
- Added cleanup call at the start of `findDoodleDuelMatch()` to remove user from any existing waiting matches
- Ensures user starts fresh when searching for a new match

#### When Leaving the Screen
- Added `useEffect` cleanup that runs when component unmounts
- Automatically leaves the match if status is "waiting"
- Does NOT leave if match is "active" or "completed" (user should finish or view results)

#### Back Button Handler
- Updated back button to explicitly leave waiting matches before navigation
- Ensures cleanup even when user manually goes back

## How It Works

### Scenario 1: User Leaves While Waiting
1. User clicks "Find Match" → joins/creates a waiting match
2. User clicks "Back to Home" or navigates away
3. Cleanup function automatically removes them from the match
4. Empty match is automatically deleted
5. User can search for a new match without errors

### Scenario 2: User Searches Multiple Times
1. User clicks "Find Match" → cleanup runs first
2. Any lingering waiting matches are cleaned up
3. User joins a fresh match
4. No "already in match" errors

### Scenario 3: Match Becomes Active
1. User is waiting for a match
2. Another player joins → match status changes to "active"
3. User navigates to drawing screen
4. If user leaves during drawing, they remain in the match (correct behavior)
5. Match completion is handled separately

## Deployment Steps

1. **Run the migration:**
   ```bash
   node run-leave-match-migration.js
   ```
   
   OR manually run the SQL in Supabase dashboard:
   ```bash
   cat SUPABASE/migrations/add_leave_match_function.sql
   ```

2. **Deploy the updated edge function:**
   ```bash
   cd SUPABASE/functions
   ./deploy.sh
   ```

3. **Test the fix:**
   - Open the app
   - Go to Multiplayer
   - Click "Find Match"
   - Wait in the lobby
   - Click "Back to Home"
   - Go back to Multiplayer
   - Click "Find Match" again
   - Should work without errors!

## Edge Cases Handled

✅ User leaves before match starts → Removed from match  
✅ User closes app while waiting → Match cleaned up on next search  
✅ Empty matches → Automatically deleted  
✅ Match becomes active while leaving → User stays in match  
✅ Multiple users leave → Each removed independently  
✅ Last user leaves → Match deleted completely  

## Files Changed

1. `/SUPABASE/migrations/add_leave_match_function.sql` (new)
2. `/SUPABASE/functions/matchmaking/index.ts` (updated)
3. `/SCREENS/MultiplayerScreen.tsx` (updated)
4. `/run-leave-match-migration.js` (new - helper script)

## Testing Checklist

- [ ] User can search for a match
- [ ] User can leave while waiting and search again
- [ ] No "already in match" errors
- [ ] Match starts correctly when 2 players join
- [ ] Users can't leave active/completed matches inappropriately
- [ ] Empty matches are cleaned up
- [ ] Multiple rapid searches work correctly

