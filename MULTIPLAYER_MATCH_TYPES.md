# Multiplayer Match Types Implementation

## Overview
Added support for different player counts in multiplayer matches. Users can now choose between **2-player (1v1)** and **4-player (Battle Royale)** matches.

## Features

### Match Types
- **2-Player (1v1 Duel)**: Classic head-to-head drawing competition
- **4-Player (Battle Royale)**: Four players compete simultaneously

### Smart Matchmaking
- 2-player searches only match with other 2-player searches
- 4-player searches only match with other 4-player searches
- Matches start automatically when filled (2/2 or 4/4)

## Changes Made

### 1. Database Migration (`add_max_players_parameter.sql`)

Updated `find_or_create_match` function to accept `max_players_count` parameter:

```sql
CREATE OR REPLACE FUNCTION public.find_or_create_match(
  match_type TEXT DEFAULT 'multiplayer',
  difficulty_level TEXT DEFAULT 'easy',
  max_players_count INTEGER DEFAULT 2  -- New parameter
)
```

**Key Features:**
- Validates `max_players` is between 2 and 10
- Only matches players with the same `max_players` setting
- Creates matches with specified player limit
- Default remains 2 players for backward compatibility

### 2. Edge Function Updates (`SUPABASE/functions/matchmaking/index.ts`)

**Added:**
- `maxPlayers` parameter extraction from request body
- Pass `max_players_count` to database function
- Include `max_players` in match response data

**Example Request:**
```typescript
await supabase.functions.invoke('matchmaking', {
  body: {
    action: 'find_or_create_match',
    matchType: 'multiplayer',
    difficulty: 'easy',
    maxPlayers: 4  // Specify 2 or 4
  }
});
```

### 3. Frontend Updates (`SCREENS/MultiplayerScreen.tsx`)

**Added UI Components:**
- Player count selector (2 vs 4 players)
- Visual feedback for selected player count
- Dynamic button text showing chosen player count
- Real-time player count display in match lobby

**New State:**
```typescript
const [selectedPlayerCount, setSelectedPlayerCount] = useState<2 | 4>(2);
```

**UI Features:**
- Toggle between 2-player and 4-player modes
- Shows "1v1 Duel" for 2-player
- Shows "Battle Royale" for 4-player
- Displays current match capacity (e.g., "Players: 2/4")

## How It Works

### Scenario 1: Creating a 2-Player Match
1. User selects "2 Players" option
2. Clicks "Find 2-Player Match"
3. System searches for existing 2-player waiting matches
4. If found, joins that match
5. If not found, creates new 2-player match
6. Match starts when 2/2 players joined

### Scenario 2: Creating a 4-Player Match
1. User selects "4 Players" option
2. Clicks "Find 4-Player Match"
3. System searches for existing 4-player waiting matches
4. If found, joins that match
5. If not found, creates new 4-player match
6. Match starts when 4/4 players joined

### Scenario 3: Matchmaking Isolation
- User A searches for 2-player match
- User B searches for 4-player match
- They will NOT be matched together
- Each waits for appropriate player count

## Match Flow

```
┌─────────────────────────────────────────┐
│  User Opens Multiplayer Screen          │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│  Select Player Count (2 or 4)           │
│  [👥 2 Players]  [👥👥 4 Players]        │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│  Click "Find X-Player Match"            │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│  Cleanup old waiting matches            │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│  Search for match with same max_players │
└─────────┬───────────┬───────────────────┘
          │           │
   Found  │           │  Not Found
          │           │
┌─────────▼──┐   ┌────▼──────────────────┐
│ Join Match │   │  Create New Match     │
└─────────┬──┘   └────┬──────────────────┘
          │           │
          └───────┬───┘
                  │
┌─────────────────▼───────────────────────┐
│  Wait in Lobby                          │
│  Shows: Players X/Y                     │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│  Match Full? (X == Y)                   │
└─────────┬───────────┬───────────────────┘
          │           │
    Yes   │           │  No (Keep waiting)
          │           │
┌─────────▼──────┐    └─────────────────┐
│ Start Match!   │                      │
│ Navigate to    │  ◄───────────────────┘
│ Drawing Screen │
└────────────────┘
```

## Database Schema

### matches Table
```sql
id            UUID
type          TEXT (default: 'multiplayer')
status        TEXT (waiting/active/completed)
max_players   INTEGER (default: 2)  ← Key field
word          TEXT
difficulty    TEXT
created_at    TIMESTAMPTZ
```

### Matching Logic
```sql
-- Only finds matches with SAME max_players count
WHERE m.status = 'waiting' 
  AND m.type = match_type
  AND m.difficulty = difficulty_level
  AND m.max_players = max_players_count  ← Important!
  AND (participant_count) < m.max_players
```

## Deployment

### 1. Run Database Migration
```bash
node run-max-players-migration.js
```

### 2. Deploy Edge Function
```bash
cd SUPABASE/functions
./deploy.sh
```

### 3. Test

#### Test 2-Player Matches:
1. Open app on Device 1
2. Select "2 Players"
3. Click "Find 2-Player Match"
4. Open app on Device 2
5. Select "2 Players"
6. Click "Find 2-Player Match"
7. ✅ Should match together
8. ✅ Match should start with 2/2 players

#### Test 4-Player Matches:
1. Open app on 4 devices
2. Each selects "4 Players"
3. Each clicks "Find 4-Player Match"
4. ✅ All 4 should join same match
5. ✅ Match should start when 4/4 players joined

#### Test Isolation:
1. Device 1: Select "2 Players" → Find Match
2. Device 2: Select "4 Players" → Find Match
3. ✅ They should NOT match together
4. ✅ Each should wait in separate matches

## UI Preview

### Match Selection Screen
```
┌─────────────────────────────────────────┐
│          Choose Match Type              │
│  Select how many players you want to    │
│         compete against                 │
│                                         │
│  ┌────────────┐    ┌────────────┐      │
│  │ 👥 2 Players│    │👥👥 4 Players│     │
│  │  1v1 Duel  │    │Battle Royale│     │
│  └────────────┘    └────────────┘      │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │ 🎨 Find 2-Player Match            │  │
│  │ Draw against 1 opponent           │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │ 🔍 Doodle Hunt Mode               │  │
│  │ Coming Soon                       │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Waiting Lobby (4-Player)
```
┌─────────────────────────────────────────┐
│    Waiting for more players...          │
│                                         │
│  Match ID: a1b2c3d4...                 │
│  Players: 3/4                          │
│                                         │
│  Players:                              │
│  ┌────────────────────────────────┐   │
│  │ Alice123 ✓                     │   │
│  ├────────────────────────────────┤   │
│  │ Bob456 ✓                       │   │
│  ├────────────────────────────────┤   │
│  │ Charlie789 ✓                   │   │
│  └────────────────────────────────┘   │
│                                         │
│  Waiting for 1 more player...          │
└─────────────────────────────────────────┘
```

## Future Enhancements

Potential additions for future versions:

### More Player Counts
- 3-player matches
- 6-player matches
- 8-player matches

### Custom Player Counts
```typescript
// Allow users to set any count 2-10
const [customPlayerCount, setCustomPlayerCount] = useState(2);
```

### Match Modes
- **Ranked**: Competitive with ELO rating
- **Casual**: Just for fun
- **Tournament**: Bracket-style competition

### Difficulty Modes
Already supported by the function, just add UI:
- Easy words
- Medium words
- Hard words

## Files Changed

1. ✅ `/SUPABASE/migrations/add_max_players_parameter.sql` (new)
2. ✅ `/SUPABASE/functions/matchmaking/index.ts` (updated)
3. ✅ `/SCREENS/MultiplayerScreen.tsx` (updated)
4. ✅ `/run-max-players-migration.js` (new - helper script)

## Testing Checklist

- [ ] 2-player match creation works
- [ ] 4-player match creation works
- [ ] 2-player searches don't match with 4-player searches
- [ ] Match starts automatically when filled
- [ ] Player count displays correctly in lobby
- [ ] Leaving a waiting match works (from previous fix)
- [ ] Re-searching after leaving works
- [ ] Match data includes max_players field
- [ ] UI toggles between 2 and 4 players correctly
- [ ] Drawing screen works for both match types
- [ ] Results screen works for both match types

## Backward Compatibility

✅ **Fully backward compatible!**
- Default `max_players` is still 2
- Existing matches continue to work
- If `maxPlayers` not specified, defaults to 2
- No breaking changes to existing functionality

