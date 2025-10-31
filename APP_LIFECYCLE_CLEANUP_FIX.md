# App Lifecycle Cleanup Fix

## Problem
When users close the app, the following issues were occurring:
1. **Match deletion not triggered**: Users remained in waiting matches even after closing the app
2. **Roulette XP not awarded**: Users who closed the app before reaching the results screen didn't receive their XP rewards

## Root Cause
The app only handled cleanup when users navigated away from screens using `useEffect` cleanup functions, but didn't handle the case when users closed the app entirely or put it in the background.

## Solution Implemented

### 1. App Lifecycle Event Handling (`app.tsx`)

**Added comprehensive app state monitoring:**
- Listens for `AppState` changes (background, inactive, active)
- Triggers cleanup when app goes to background or inactive state
- Ensures cleanup happens even when users force-close the app

```typescript
// Handle app lifecycle events for cleanup
const handleAppStateChange = async (nextAppState: string) => {
  if (nextAppState === 'background' || nextAppState === 'inactive') {
    await cleanupActiveMatches();
  }
};

const subscription = AppState.addEventListener('change', handleAppStateChange);
```

### 2. Comprehensive Match Cleanup Function

**Created `cleanupActiveMatches()` function:**
- Gets current authenticated user
- Calls comprehensive cleanup for both regular and roulette matches
- Handles cleanup gracefully with error handling

### 3. Enhanced Database Cleanup Functions

**Created new database migration (`add_comprehensive_cleanup_function.sql`):**
- Added `cleanup_all_user_waiting_matches()` function
- Handles both regular matches (`matches` table) and roulette matches (`roulette_matches` table)
- Removes user from all waiting matches and cleans up empty matches

### 4. Updated Matchmaking Edge Function

**Enhanced `SUPABASE/functions/matchmaking/index.ts`:**
- Added `cleanup_all_waiting_matches` action
- Added `handleCleanupAllWaitingMatches()` handler
- Calls the comprehensive database cleanup function

### 5. Automatic XP Awarding System

**Created new database migration (`add_automatic_xp_awarding.sql`):**
- Added `award_roulette_xp_automatically()` function
- Automatically awards XP when roulette matches complete
- Updated `complete_roulette_match()` to call automatic XP awarding
- Updated `advance_roulette_turn()` to use the enhanced completion function

**XP Awarding Logic:**
- 2-player matches: 150 XP for win, 40 XP for loss
- 4-player matches: 200 XP for win, 50 XP for loss
- XP is awarded immediately when match completes, regardless of user app state

### 6. Frontend XP Handling Update

**Updated `RouletteResultsScreen.tsx`:**
- Added error handling for XP awarding
- Prevents double XP awarding if database already awarded it
- Gracefully handles cases where XP was awarded automatically

## Benefits

### ✅ Match Deletion Fixed
- Users are automatically removed from waiting matches when they close the app
- Empty matches are cleaned up automatically
- Prevents "ghost" matches with inactive users

### ✅ Roulette XP System Fixed
- XP is awarded automatically when matches complete
- Users receive XP even if they close the app before seeing results
- Prevents XP loss due to app crashes or forced closures

### ✅ Improved User Experience
- No more stuck matches when users close the app
- Reliable XP rewards regardless of app usage patterns
- Better handling of network issues and app state changes

## Technical Details

### Database Functions Added
1. `cleanup_all_user_waiting_matches()` - Comprehensive cleanup
2. `award_roulette_xp_automatically()` - Automatic XP awarding
3. Enhanced `complete_roulette_match()` - XP awarding integration
4. Enhanced `advance_roulette_turn()` - Turn limit with XP awarding

### Edge Function Actions Added
1. `cleanup_all_waiting_matches` - Frontend cleanup trigger

### App Lifecycle Integration
1. `AppState` event listener in main app component
2. Background/inactive state detection
3. Automatic cleanup trigger on app state change

## Testing Recommendations

1. **Match Cleanup Testing:**
   - Join a waiting match, close app, verify match is cleaned up
   - Test with both regular and roulette matches
   - Verify empty matches are deleted

2. **XP Awarding Testing:**
   - Complete a roulette match, close app before results screen
   - Reopen app, check that XP was awarded
   - Verify no double XP awarding occurs

3. **App State Testing:**
   - Test background/foreground transitions
   - Test app force-close scenarios
   - Test network connectivity issues during cleanup

## Files Modified

1. `app.tsx` - Added app lifecycle handling
2. `SUPABASE/functions/matchmaking/index.ts` - Added comprehensive cleanup action
3. `SUPABASE/migrations/updates/add_comprehensive_cleanup_function.sql` - New database function
4. `SUPABASE/migrations/updates/add_automatic_xp_awarding.sql` - Automatic XP awarding
5. `SCREENS/RouletteResultsScreen.tsx` - Enhanced XP handling

## Deployment Notes

1. Deploy database migrations first
2. Deploy edge function updates
3. Deploy frontend changes
4. Test thoroughly in staging environment
5. Monitor logs for any cleanup or XP awarding issues
