# Doodle Hunt Roulette - Implementation Guide

## 🎲 Overview

Doodle Hunt Roulette is a turn-based multiplayer drawing game where 2-4 players take turns drawing while others watch in real-time. The AI tries to guess what was drawn, and the first player to make the AI guess correctly wins!

## ✅ What Was Implemented

### 1. Database Schema
- **4 new tables** created in `SUPABASE/migrations/20240115_create_roulette_tables.sql`:
  - `roulette_matches` - Main game state
  - `roulette_participants` - Players in each match
  - `roulette_turns` - History of each turn
  - `roulette_drawing_strokes` - Real-time stroke data (temporary)

### 2. Database Functions
- `find_or_create_roulette_match()` - Matchmaking
- `leave_roulette_match()` - Leave before/during game
- `submit_roulette_turn()` - Submit drawing for AI guess
- `advance_roulette_turn()` - Move to next player
- `complete_roulette_match()` - Mark game complete with winner
- `get_roulette_match_status()` - Get full game state
- `cleanup_roulette_match()` - Delete SVGs and paths after game

### 3. Edge Function Updates
Updated `SUPABASE/functions/matchmaking/index.ts` with 6 new handlers:
- `handleFindOrCreateRoulette` - Create/join roulette matches
- `handleLeaveRouletteMatch` - Leave match
- `handleGetRouletteStatus` - Get match details
- `handleSubmitRouletteTurn` - Submit turn and check win condition
- `handleAddRouletteStroke` - Real-time stroke broadcasting
- `handleCompleteRouletteMatch` - End game and cleanup

### 4. Frontend Screens
- **MultiplayerScreen.tsx** - Added Roulette game mode button
- **RouletteDrawingScreen.tsx** (NEW) - Main gameplay screen with:
  - Drawing mode (your turn)
  - Watching mode (others' turns)
  - Real-time stroke updates
  - 20-second timer
  - AI feedback display
- **RouletteResultsScreen.tsx** (NEW) - Winner display and turn history

### 5. Navigation
Added routes in `NAVIGATION/rootNavigator.tsx`:
- `RouletteDrawing`
- `RouletteResults`

## 🎮 Game Flow

### Matchmaking
1. User goes to Multiplayer screen
2. Selects 2 or 4 players
3. Clicks "🎲 Doodle Hunt Roulette"
4. Joins waiting lobby
5. When match is full → Random turn order assigned → Game starts

### Gameplay
1. **Turn starts**: Current player has 20 seconds to draw
2. **Drawing**: Player draws while others watch in real-time
3. **Submission**: Player submits OR timer expires
4. **AI Guess**: Edge function calls `guess-drawing` AI
5. **Check Win**: If similarity ≥ 100% → Winner!
6. **Next Turn**: Otherwise, advance to next player
7. **Repeat**: Until someone guesses correctly

### Game End
1. Winner declared
2. All SVG files deleted from storage
3. All `drawing_paths` and `svg_url` cleared from database
4. Players see results screen with:
   - Winner announcement
   - Secret word revealed
   - Turn history with AI guesses
   - Play again button

## 🗑️ SVG Cleanup Implementation

### When SVGs Are Deleted
1. **After each turn**: Stroke data deleted from `roulette_drawing_strokes`
2. **When game ends**: 
   - Edge function calls `cleanup_roulette_match()`
   - Deletes all SVG files from Supabase Storage
   - Clears `svg_url` and `drawing_paths` from database
   - Keeps metadata (AI guesses, scores, winner)

### What Gets Deleted
```
✓ SVG files in storage/drawings/
✓ drawing_paths (JSONB) from roulette_turns
✓ svg_url references from roulette_turns
✓ ALL records from roulette_drawing_strokes
```

### What Gets Kept
```
✓ Match record (winner, word, turn count)
✓ AI guesses and similarity scores
✓ Participant list
✓ Turn metadata
```

## 📦 Deployment Steps

### Step 1: Run Database Migration & Fixes
1. Go to https://supabase.com/dashboard/project/_/sql
2. Run these SQL files in order:
   - `SUPABASE/migrations/20240115_create_roulette_tables.sql` (creates tables)
   - `fix-roulette-with-user-param.sql` (fixes function with user_id parameter)
   - `add-profiles-foreign-key.sql` (adds foreign key to profiles)
   - `fix-rls-policies.sql` (fixes RLS policies to avoid recursion)
   - `enable-roulette-realtime.sql` (enables realtime subscriptions)

### Step 2: Deploy Edge Function
1. Go to https://supabase.com/dashboard/project/_/functions
2. Find **matchmaking** function
3. Click **⋮** menu → **Redeploy**
4. Wait for deployment to complete

### Step 3: Test the App
```bash
npm start
```

Test with 2 devices/users:
- Both should join lobby
- See participant count (1/2 → 2/2)
- Both navigate to game when full
- Current player can draw
- Other player watches in real-time
- Submit works and AI guesses
- Winner is detected and both navigate to results

## 🧪 Testing Checklist

### Basic Flow
- [ ] Can create 2-player roulette match
- [ ] Can create 4-player roulette match
- [ ] Lobby shows waiting players
- [ ] Match starts when full
- [ ] Turn order is randomized

### Drawing & Watching
- [ ] Current player can draw
- [ ] Other players see drawing in real-time
- [ ] Timer counts down (20 seconds)
- [ ] Drawing tools work (colors, sizes, erase, undo, clear)
- [ ] Auto-submit when timer reaches 0

### Turn Submission
- [ ] AI guessing works
- [ ] Feedback shows AI guess and score
- [ ] Turn advances to next player if not correct
- [ ] Game ends when AI guesses correctly (≥100%)
- [ ] Winner is announced

### Results Screen
- [ ] Winner displayed correctly
- [ ] Secret word revealed
- [ ] Turn history shown
- [ ] All AI guesses and scores displayed
- [ ] "Play Again" navigates to Multiplayer
- [ ] "Back to Home" navigates to HomeScreen

### Cleanup
- [ ] SVG files deleted after game ends
- [ ] drawing_paths cleared from database
- [ ] svg_url cleared from database
- [ ] Match metadata still accessible

### Edge Cases
- [ ] Player leaves during waiting → Match cancelled if empty
- [ ] Player leaves during game → Game continues with active players
- [ ] All players leave → Match cancelled
- [ ] Network interruption → Game recovers via realtime

## 🔧 Configuration

### Timer Duration
To change turn time limit, edit `RouletteDrawingScreen.tsx`:
```typescript
const [timeLeft, setTimeLeft] = useState(20); // Change to desired seconds
```

### Player Count Options
Currently supports 2 or 4 players. To add more options, edit:
1. `MultiplayerScreen.tsx` - Add new button
2. Database migration - Update `max_players` constraint if needed

### Word Difficulty
Currently uses "easy" words. To change, edit database function:
```sql
-- In find_or_create_roulette_match function
SELECT word INTO v_word
FROM words
WHERE difficulty = 'medium' -- Change here
ORDER BY RANDOM()
LIMIT 1;
```

## 🔄 Real-Time Architecture

### Supabase Realtime Subscriptions

**RouletteDrawingScreen subscribes to:**
1. **Match updates** (`roulette_matches`)
   - Turn advancement
   - Game completion
2. **Stroke updates** (`roulette_drawing_strokes`)
   - Real-time drawing sync
3. **Turn submissions** (`roulette_turns`)
   - AI feedback display

**MultiplayerScreen subscribes to:**
1. **Match updates** (waiting → in_progress)
   - Auto-navigate when match starts
2. **Participant updates** (new players joining)
   - Update player count in lobby

### Data Flow
```
Player draws stroke
    ↓
Insert to roulette_drawing_strokes
    ↓
Realtime broadcasts to all players
    ↓
Other players' canvases update
    ↓
On submit: Call AI, insert to roulette_turns
    ↓
Check if won → Complete match → Cleanup
```

## 📊 Database Queries

### Get match status
```typescript
await supabase.functions.invoke('matchmaking', {
  body: {
    action: 'get_roulette_status',
    matchId: matchId
  }
});
```

### Submit a turn
```typescript
await supabase.functions.invoke('matchmaking', {
  body: {
    action: 'submit_roulette_turn',
    matchId: matchId,
    svgUrl: svgUrl,
    pathsJson: pathsJson,
    aiGuess: aiGuess,
    similarityScore: similarityScore
  }
});
```

## 🐛 Troubleshooting

### "Function not found" Error
- Redeploy edge function: `supabase functions deploy matchmaking`
- Check function logs in Supabase dashboard

### Real-time not working
- Check Supabase Realtime is enabled in project settings
- Verify RLS policies allow subscriptions
- Check browser console for subscription errors

### SVGs not deleting
- Verify storage permissions
- Check edge function logs
- Manually delete from Supabase Storage dashboard if needed

### Players can't join match
- Check `max_players` constraint
- Verify matchmaking function logic
- Check for existing waiting matches

## 📝 Files Created/Modified

### New Files
- `SUPABASE/migrations/20240115_create_roulette_tables.sql`
- `run-roulette-migration.js`
- `SCREENS/RouletteDrawingScreen.tsx`
- `SCREENS/RouletteResultsScreen.tsx`
- `DOODLE_HUNT_ROULETTE_IMPLEMENTATION.md`

### Modified Files
- `SUPABASE/functions/matchmaking/index.ts`
- `SCREENS/MultiplayerScreen.tsx`
- `NAVIGATION/rootNavigator.tsx`

## 🎉 Success!

You now have a fully functional Doodle Hunt Roulette game mode with:
- ✅ Turn-based multiplayer (2-4 players)
- ✅ Real-time drawing sync
- ✅ AI guessing integration
- ✅ Winner detection
- ✅ Automatic SVG cleanup
- ✅ Complete game history

Deploy and enjoy! 🎨🎲

