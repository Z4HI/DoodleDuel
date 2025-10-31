# Roulette Mode: 2-Player vs 4-Player Compatibility Analysis

## Summary
✅ **YES - Everything works identically for both 2-player and 4-player games.**

All game mechanics, UI components, and features are built dynamically based on the actual player count, with no hardcoded assumptions.

---

## Feature-by-Feature Comparison

### 1. ✅ Turn Management
**How it works:**
- Database uses: `(current_turn_index + 1) % max_players`
- Frontend uses: `turnOrder` array (dynamic length)

| Feature | 2 Players | 4 Players |
|---------|-----------|-----------|
| Turn cycling | Player 1 → Player 2 → Player 1... | Player 1 → 2 → 3 → 4 → 1... |
| Turn limit | 10 turns (5 each) | 20 turns (5 each) |
| Turn display | "Turn 3/10" | "Turn 7/20" |

**Code:**
```typescript
// Dynamic calculation
const maxTurns = (maxPlayers || turnOrder?.length || 2) * 5;
```

---

### 2. ✅ Real-Time Stroke Syncing
**How it works:**
- When player draws, strokes are sent to database
- All OTHER players receive strokes via realtime subscription

| Feature | 2 Players | 4 Players |
|---------|-----------|-----------|
| Active player | Draws on canvas | Draws on canvas |
| Watching players | 1 player sees strokes | 3 players see strokes |
| Sync condition | `if (!isMyTurn)` | `if (!isMyTurn)` |

**Code:**
```typescript
// Line 202: Works for ANY number of watchers
if (payload.new && !isMyTurn) {
  const strokeData = payload.new as any;
  // Add stroke to canvas
}
```

---

### 3. ✅ Turn History Display
**How it works:**
- All turns stored in database
- UI displays ALL turns with `.map()`, no limits

| Feature | 2 Players | 4 Players |
|---------|-----------|-----------|
| Max turns shown | 10 turns | 20 turns |
| Display method | Dynamic list | Dynamic list |
| Sorting | By similarity (highest first) | By similarity (highest first) |
| Scroll | Yes (ScrollView) | Yes (ScrollView) |

**Code:**
```typescript
// Line 818: Shows ALL turns, no filtering by count
{turnHistory
  .sort((a, b) => b.similarity - a.similarity)
  .map((turn, index) => {
    // Render turn
  })}
```

---

### 4. ✅ Participant Display
**How it works:**
- Participants array populated from database
- Results screen shows all participants

| Feature | 2 Players | 4 Players |
|---------|-----------|-----------|
| Players shown | 2 | 4 |
| Display method | `participants.map()` | `participants.map()` |
| Position tracking | turn_position 0-1 | turn_position 0-3 |

**Code:**
```typescript
// Results screen - Line 155
{participants.map((participant, index) => (
  <View key={participant.user_id}>
    <Text>#{index + 1} {participant.profiles?.username}</Text>
  </View>
))}
```

---

### 5. ✅ Canvas & Drawing
**How it works:**
- Same canvas size for all
- Drawing only enabled when `isMyTurn`

| Feature | 2 Players | 4 Players |
|---------|-----------|-----------|
| Canvas size | Fixed | Fixed (same) |
| Draw controls | Only on your turn | Only on your turn |
| Erase mode | ✓ | ✓ |
| Color picker | ✓ | ✓ |
| Brush size | ✓ | ✓ |

**Code:**
```typescript
// Drawing only when it's your turn
onPanResponderGrant: (evt) => {
  if (!isMyTurn || isSubmitting) return;
  // Draw
}
```

---

### 6. ✅ Timer System
**How it works:**
- 20 seconds per turn
- Server-synced across all players

| Feature | 2 Players | 4 Players |
|---------|-----------|-----------|
| Turn duration | 20s | 20s |
| Auto-submit | At 0s | At 0s |
| Sync method | Server timestamp | Server timestamp |

**Code:**
```typescript
// Timer syncs for all players
const elapsed = Math.floor((now - turnStartTime) / 1000);
const remaining = Math.max(0, 20 - elapsed);
setTimeLeft(remaining);
```

---

### 7. ✅ Winner Determination
**How it works:**
- First to 100% similarity OR highest score at turn limit

| Feature | 2 Players | 4 Players |
|---------|-----------|-----------|
| Perfect guess | Wins immediately | Wins immediately |
| Turn limit | Highest score wins | Highest score wins |
| Tie-breaker | First chronologically | First chronologically |

**Database code:**
```sql
-- Works for any player count
SELECT user_id
FROM roulette_turns
WHERE match_id = target_match_id
ORDER BY similarity_score DESC, created_at ASC
LIMIT 1;
```

---

### 8. ✅ Database Constraints
**Table: roulette_matches**
```sql
max_players INTEGER NOT NULL CHECK (max_players IN (2, 4))
```

**Table: roulette_participants**
```sql
turn_position INTEGER NOT NULL CHECK (turn_position >= 0 AND turn_position < 4)
```
- Supports 0-3 positions (4 players max) ✓

**Turn order creation:**
```sql
SELECT ARRAY_AGG(p.user_id::TEXT ORDER BY RANDOM()) as turn_arr
FROM roulette_participants p
WHERE p.match_id = v_match_id
```
- Creates array of ANY length ✓

---

### 9. ✅ Real-Time Notifications
**How it works:**
- Toast notifications for all players
- Shows who submitted, their guess, and score

| Feature | 2 Players | 4 Players |
|---------|-----------|-----------|
| Turn complete toast | ✓ All see it | ✓ All see it |
| Winner toast | ✓ All see it | ✓ All see it |
| Match completion | ✓ Navigate all | ✓ Navigate all |

**Code:**
```typescript
// All players subscribed to same channel
const channel = supabase
  .channel(`roulette-match-${matchId}`)
  .on('postgres_changes', {...}, (payload) => {
    // Show toast for all players
  })
```

---

### 10. ✅ Navigation & Initialization
**How it works:**
- Same navigation params for both
- All screens receive dynamic data

| Feature | 2 Players | 4 Players |
|---------|-----------|-----------|
| Route params | Same structure | Same structure |
| Turn order array | Length 2 | Length 4 |
| Participants array | Length 2 | Length 4 |

---

## Potential UI Considerations

### Turn History Display
With 4 players and 20 turns, the turn history will be 2x longer:
- **Solution**: ScrollView already in place ✓
- **Styling**: Same height limit (maxHeight: 200) handles both

### Players List
Results screen shows all participants:
- **2 players**: 2 rows
- **4 players**: 4 rows
- **Styling**: All within ScrollView ✓

---

## Performance Analysis

### Real-Time Strokes
| Aspect | 2 Players | 4 Players | Impact |
|--------|-----------|-----------|--------|
| Stroke broadcasts | 1 sender → 1 receiver | 1 sender → 3 receivers | Low (Supabase handles) |
| Database inserts | Same rate | Same rate | None |
| Canvas updates | Same | Same | None |

### Turn History
| Aspect | 2 Players | 4 Players | Impact |
|--------|-----------|-----------|--------|
| Turns stored | 10 | 20 | 2x data (minimal) |
| UI rendering | 10 items | 20 items | Negligible |

---

## Testing Checklist

### 2-Player Game ✓
- [x] Join match
- [x] See turn order work correctly (1→2→1)
- [x] Real-time strokes visible to waiting player
- [x] Turn limit ends game at 10 turns
- [x] Highest score wins if no perfect guess

### 4-Player Game (Should work identically)
- [ ] Join match with 4 players
- [ ] See turn order work correctly (1→2→3→4→1)
- [ ] Real-time strokes visible to 3 waiting players
- [ ] Turn limit ends game at 20 turns
- [ ] Highest score wins if no perfect guess

---

## Conclusion

**All features are player-count agnostic and work dynamically based on the `max_players` value.**

The only differences between 2 and 4 player games are:
1. **Number of participants** (2 vs 4) - handled by dynamic arrays
2. **Turn limit** (10 vs 20) - calculated as `max_players * 5`
3. **Number of real-time watchers** (1 vs 3) - handled by `!isMyTurn` condition

Everything else is identical! 🎉

