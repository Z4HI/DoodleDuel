# Doodle Hunt Friend Roulette Migration

## Overview

This document outlines the changes needed to convert "Play a Friend" Doodle Hunt from an individual attempts system to a turn-based roulette system matching 2-player multiplayer roulette.

## Key Changes

### 1. Database Migration ✅ COMPLETED
**Files:** 
- `SUPABASE/migrations/core/create_doodle_hunt_friend_roulette_system.sql` (main tables & functions)
- `SUPABASE/migrations/updates/add_doodle_hunt_friend_turn_limit.sql` (10 turn limit)

Added new tables and functions:
- `doodle_hunt_friend_turns` - Turn history for friend duels
- `doodle_hunt_friend_strokes` - Real-time drawing strokes
- Modified `duels` table to add turn-based fields:
  - `current_turn_index`
  - `turn_order` (array of user IDs)
  - `roulette_turn_number`
  - `turn_start_time`

New functions:
- `initialize_doodle_hunt_duel_turns()` - Sets up turn order when both players accept
- `submit_doodle_hunt_friend_turn()` - Submit turn with AI guess
- `advance_doodle_hunt_friend_turn()` - Move to next player
- `complete_doodle_hunt_friend_match()` - End game when someone wins
- `get_doodle_hunt_friend_status()` - Get match state
- `cleanup_doodle_hunt_friend_duel()` - Cleanup after game

### 2. Edge Function Updates ✅ COMPLETED
**File:** `SUPABASE/functions/matchmaking/index.ts`

Added three new handlers:
- `get_doodle_hunt_friend_status` - Get duel status with turns
- `submit_doodle_hunt_friend_turn` - Submit a turn
- `add_doodle_hunt_friend_stroke` - Real-time stroke sync

### 3. Frontend Changes ⚠️ TO DO
**File:** `SCREENS/DoodleHuntFriend.tsx`

**MAJOR REFACTOR REQUIRED:**

Current system:
- Each player makes up to 5 individual attempts
- Players compete on best score/number of attempts
- Both finish independently then see results

New system (roulette style):
- Players take turns (alternating)
- Each turn: one draws while other watches in real-time
- AI guesses after each turn
- First to get 100% wins
- 10 turns max (5 per player)
- If no 100% after 10 turns, highest score wins
- Real-time drawing sync

**Changes needed:**

1. **State Management:**
   - Remove: `attempts`, `maxAttempts`, `gameId`, `previousAttempts`
   - Add: `isMyTurn`, `currentTurnUser`, `turnNumber`, `turnHistory`, `timeLeft`
   - Add: Real-time subscription for duel/turn changes
   - Add: Turn-based opponent username

2. **Subscription Logic:**
   - Subscribe to `duels` table for turn changes
   - Subscribe to `doodle_hunt_friend_turns` for turn history
   - Subscribe to `doodle_hunt_friend_strokes` for real-time drawing

3. **Turn Management:**
   - Replace `submitDrawing()` with turn-based submission
   - Use `submit_doodle_hunt_friend_turn` function
   - Handle turn advancement automatically
   - Clear canvas on turn change

4. **UI Changes:**
   - Replace "Attempts X/5" with "Turn X" display
   - Add "Your Turn" / "Opponent's Turn" indicator
   - Add timer (20 seconds per turn)
   - Show turn history instead of previous attempts
   - Display opponent's username in header

5. **Drawing Synchronization:**
   - Add `strokeIndex` state
   - Send strokes via `add_doodle_hunt_friend_stroke`
   - Receive strokes in real-time subscription

6. **Game End:**
   - Remove waiting for both players logic
   - Auto-navigate to results when someone wins
   - Show winner announcement

**Reference Implementation:**
Use `SCREENS/RouletteDrawingScreen.tsx` as a template. The roulette screen already has:
- Turn-based gameplay
- Real-time stroke sync
- Timer countdown
- Turn history display
- Auto-advancement

### 4. Acceptance Flow ✅ FIXED

When opponent accepts the duel in `DuelFriendScreen.tsx`:
1. Calls `accept_duel()` RPC function (not direct UPDATE)
2. `accept_duel()` updates duel to 'in_progress' 
3. **NEW:** If gamemode is 'doodleHunt', automatically calls `initialize_doodle_hunt_duel_turns()`
4. Turn order randomly set (challenger or opponent goes first)
5. Both players navigate to `DoodleHuntFriend` screen
6. Turn order already initialized

**Fixed flow in `handleAcceptDuelInvitation()`:**
- ✅ Now uses `supabase.rpc('accept_duel', { duel_uuid: duelId })`
- Automatically handles turn initialization for Doodle Hunt
- Sends notification
- Navigates to appropriate screen based on gamemode

**Both DoodleDuel and DoodleHunt work:**
- DoodleDuel: Just updates status (no turn initialization)
- DoodleHunt: Updates status AND initializes turn order

## Migration Steps

### Step 1: Run Database Migrations
```bash
# Go to Supabase SQL editor
# Run these IN ORDER:
# 1. SUPABASE/migrations/core/create_doodle_hunt_friend_roulette_system.sql
# 2. SUPABASE/migrations/updates/add_doodle_hunt_friend_turn_limit.sql
```

### Step 2: Deploy Edge Function
```bash
cd SUPABASE/functions
./deploy.sh  # Or use Supabase dashboard to redeploy matchmaking function
```

### Step 3: Refactor DoodleHuntFriend.tsx
This is the big one. Use `RouletteDrawingScreen.tsx` as reference.

### Step 4: Test
1. User A sends friend Doodle Hunt request to User B
2. User B accepts
3. Both navigate to game
4. Check turn order is set correctly
5. Play through turns
6. Verify real-time drawing sync
7. Verify winner detection
8. Check results screen

## Files Modified/Created

**Created:**
- ✅ `SUPABASE/migrations/core/create_doodle_hunt_friend_roulette_system.sql`
- ✅ `SUPABASE/migrations/updates/add_doodle_hunt_friend_turn_limit.sql`
- ✅ `DOODLE_HUNT_FRIEND_ROULETTE_MIGRATION.md`

**Modified:**
- ✅ `SUPABASE/functions/matchmaking/index.ts`
- ✅ `SUPABASE/migrations/README.md`
- ✅ `SCREENS/DuelFriendScreen.tsx` (accept_duel call fixed)

**Needs Major Refactor:**
- ⚠️ `SCREENS/DoodleHuntFriend.tsx` (1200+ lines, significant changes)

## Testing Checklist

After refactor:
- [ ] Can create Doodle Hunt friend request
- [ ] Opponent can accept
- [ ] Turn order is randomized (not always challenger first)
- [ ] Real-time drawing sync works
- [ ] Timer counts down (20 seconds)
- [ ] AI guessing works after each turn
- [ ] Turn advances after submission
- [ ] Winner is detected (100% guess)
- [ ] Both players navigate to results
- [ ] Old doodle_hunt_duel data still accessible
- [ ] Backward compatibility for old duels

## Backward Compatibility

**OLD SYSTEM (still exists):**
- `doodle_hunt_duel` table (individual games per player)
- `doodle_hunt_duel_guesses` table
- RPC functions: `create_doodle_hunt_duel_game`, `add_doodle_hunt_duel_guess`, `complete_doodle_hunt_duel_game`
- Used for: Individual attempts, scores, completion tracking

**NEW SYSTEM (roulette style):**
- `doodle_hunt_friend_turns` table (shared turn history)
- `doodle_hunt_friend_strokes` table (temporary strokes)
- RPC functions: `submit_doodle_hunt_friend_turn`, `advance_doodle_hunt_friend_turn`, etc.
- Used for: Turn-based gameplay, real-time sync, winner detection

**Migration Strategy:**
- Keep both systems initially
- Old duels remain functional
- New duels use roulette system
- Update `DoodleHuntFriend.tsx` to always use roulette (or detect old vs new)

## Known Issues / Considerations

1. **Old vs New Data:**
   - Existing duels might have old `doodle_hunt_duel` records
   - Need to handle gracefully or migrate

2. **Acceptance Timing:**
   - Currently challenger and opponent both navigate when accepted
   - Turn order set in `accept_duel()` function
   - Both should see game start

3. **Real-time Requirements:**
   - Must enable realtime on new tables
   - Check RLS policies allow subscriptions
   - Test on slow networks

4. **SVG Storage:**
   - Currently stores SVG URLs in turns
   - Need cleanup function similar to roulette
   - Delete after both view results

5. **Token Consumption:**
   - Currently deducts token on create
   - Should deduct on accept too?

## Next Steps

1. ✅ Complete database migration
2. ✅ Complete edge function updates
3. ⚠️ REFACTOR: `SCREENS/DoodleHuntFriend.tsx`
4. ⚠️ TEST: Full flow on 2 devices
5. ⚠️ CLEANUP: Remove old doodle_hunt_duel code if no longer needed

## Timeline Estimate

- Database migration: ✅ DONE
- Edge function: ✅ DONE
- Frontend refactor: ~4-6 hours (complex)
- Testing: ~2 hours
- **TOTAL:** ~6-8 hours remaining

## Reference

See these files for inspiration:
- `SCREENS/RouletteDrawingScreen.tsx` - Turn-based gameplay
- `SCREENS/DoodleHuntFriend.tsx` - Current implementation
- `DOODLE_HUNT_ROULETTE_IMPLEMENTATION.md` - Roulette architecture
- `SUPABASE/migrations/core/20240115_create_roulette_tables.sql` - Roulette tables

