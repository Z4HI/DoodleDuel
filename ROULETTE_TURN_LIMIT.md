# Roulette Turn Limit Implementation

## Overview
Added turn limits to the Roulette game mode. When the limit is reached, the player with the highest similarity score wins.

## Turn Limits
- **2 Player Games**: 10 turns total (5 turns per player)
- **4 Player Games**: 20 turns total (5 turns per player)

## Changes Made

### 1. Database Migration
**File**: `SUPABASE/migrations/add_roulette_turn_limit.sql`

Updated two database functions:

#### `submit_roulette_turn()`
- Added logic to track max_players and calculate turn limit
- Still returns turn_id as before
- Turn limit checking happens in `advance_roulette_turn()`

#### `advance_roulette_turn()`
- Calculates max turns: `max_players * 5`
- Checks if current turn >= max turns
- If limit reached:
  - Finds player with highest similarity score
  - Sets that player as winner
  - Marks match as completed
- Otherwise advances to next turn as usual

### 2. Edge Function
**File**: `SUPABASE/functions/matchmaking/index.ts`

Updated `handleSubmitRouletteTurn()`:
- After advancing turn, checks if match status changed to 'completed'
- If completed due to turn limit:
  - Cleans up match data
  - Deletes SVG files
  - Returns `gameOver: true` and `turnLimitReached: true`

### 3. Frontend - Drawing Screen
**File**: `SCREENS/RouletteDrawingScreen.tsx`

- Added `maxPlayers` to RouteParams
- Calculates `maxTurns = maxPlayers * 5`
- Updated timer display to show: `Turn X/Y` (e.g., "Turn 3/10")
- Players can now see how many turns remain

### 4. Frontend - Results Screen
**File**: `SCREENS/RouletteResultsScreen.tsx`

- Updated winner section to show different messages:
  - If someone guessed correctly: "Guessed correctly in X turns!"
  - If turn limit reached: "Turn limit reached (X turns) - Highest score wins!"

### 5. Frontend - Multiplayer Screen
**File**: `SCREENS/MultiplayerScreen.tsx`

- Updated all navigation calls to RouletteDrawing to include `maxPlayers` parameter
- Ensures turn limit is correctly displayed in all scenarios

## Running the Migration

### Option 1: Using the migration script
```bash
node run-turn-limit-migration.js
```

### Option 2: Run SQL directly in Supabase Dashboard
1. Go to Supabase Dashboard > SQL Editor
2. Open `SUPABASE/migrations/add_roulette_turn_limit.sql`
3. Run the entire SQL script

## Testing

1. **2 Player Game**:
   - Start a 2-player roulette match
   - Play 10 turns without getting 100% score
   - After turn 10, match should end automatically
   - Player with highest score should win

2. **4 Player Game**:
   - Start a 4-player roulette match
   - Play 20 turns without getting 100% score
   - After turn 20, match should end automatically
   - Player with highest score should win

3. **Early Win**:
   - Get 100% similarity score before turn limit
   - Match should end immediately (existing behavior)

## Edge Cases Handled

1. **Tie Scores**: If multiple players have the same highest score, the first one chronologically (created_at ASC) wins
2. **Empty Turns**: Empty turns still count toward the turn limit
3. **Turn Limit Reached During Submit**: The advance function checks and completes the match automatically

## UI Updates

- Turn counter now shows progress (e.g., "Turn 3/10")
- Results screen clearly indicates if game ended due to turn limit
- Color-coded guess bars remain the same (blue=100%, green=80-99%, yellow=60-79%, orange=40-59%, red=<40%)

