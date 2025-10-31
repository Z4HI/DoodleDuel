# 🧹 Roulette Match Cleanup System

## Overview
Roulette match data (turns, participants, strokes) is only deleted AFTER all players have viewed the results screen.

---

## 📊 How It Works

### **1. Game Ends (Someone Wins or Turn Limit Reached)**
```
Match status → 'completed'
Winner set → winner_id
Data kept → turns, participants, strokes ALL STAY
```
**No cleanup happens yet!**

---

### **2. Players View Results Screen**

When each player opens `RouletteResultsScreen`:
```javascript
// On mount
markResultsViewed() called
  ↓
Updates roulette_participants.viewed_results = TRUE for this player
```

**Database tracks who has viewed:**
```sql
roulette_participants:
- Player 1: viewed_results = TRUE  ✓
- Player 2: viewed_results = FALSE (still viewing)
- Player 3: viewed_results = TRUE  ✓
- Player 4: viewed_results = FALSE (still viewing)
```

---

### **3. Player Leaves Results Screen**

When a player navigates away (back to home, play again, etc.):
```javascript
// On unmount
attemptCleanup() called
  ↓
Calls cleanup_roulette_match()
  ↓
Function checks: "Have ALL players viewed?"
```

---

### **4. Cleanup Decision**

```sql
IF all players have viewed_results = TRUE THEN
  -- Delete strokes
  DELETE FROM roulette_drawing_strokes
  
  -- Delete turns
  DELETE FROM roulette_turns
  
  -- Delete participants
  DELETE FROM roulette_participants
  
  -- Delete SVG files from storage
  
  -- Keep match record for stats
  RETURN TRUE (cleanup successful)
ELSE
  -- Someone still hasn't viewed
  RETURN FALSE (cleanup deferred)
END IF
```

---

## 🔄 Example Flow (4-Player Game)

### **Timeline:**

**T+0s: Game ends**
- Match status = completed
- Data intact ✓

**T+5s: Player 1 opens results**
- `viewed_results` = TRUE for Player 1
- Cleanup attempt → SKIPPED (3 others haven't viewed)

**T+10s: Player 2 opens results**
- `viewed_results` = TRUE for Player 2
- Cleanup attempt → SKIPPED (2 others haven't viewed)

**T+15s: Player 3 opens results**
- `viewed_results` = TRUE for Player 3
- Cleanup attempt → SKIPPED (Player 4 hasn't viewed)

**T+20s: Player 4 opens results**
- `viewed_results` = TRUE for Player 4
- **All 4 players have viewed!**

**T+25s: Player 4 leaves results screen**
- Cleanup attempt → **SUCCESS!**
- ✓ Strokes deleted
- ✓ Turns deleted  
- ✓ Participants deleted
- ✓ SVG files deleted
- ✓ Match record kept

---

## 📦 What Gets Deleted

### **After All Players View:**
```
roulette_drawing_strokes  → DELETED
roulette_turns           → DELETED
roulette_participants    → DELETED
SVG files in storage     → DELETED
```

### **What Stays:**
```
roulette_matches → KEPT (for stats/history)
  - id
  - secret_word
  - winner_id
  - status = 'completed'
  - turn_number
  - created_at
  - completed_at
```

---

## 🔧 Database Changes

### **New Column:**
```sql
roulette_participants:
  + viewed_results BOOLEAN DEFAULT FALSE
```

### **New Function:**
```sql
mark_roulette_results_viewed(match_id, user_id)
  - Marks that this player has viewed results
```

### **Updated Function:**
```sql
cleanup_roulette_match(match_id)
  - NOW checks if all players viewed
  - Only deletes if everyone has seen results
  - Returns TRUE if cleaned, FALSE if deferred
```

---

## 🎯 Benefits

1. ✅ **Players can always see results** - Data stays until everyone's done
2. ✅ **No race conditions** - Last player to leave triggers cleanup
3. ✅ **Automatic cleanup** - No manual intervention needed
4. ✅ **Database stays clean** - Eventually all data is removed
5. ✅ **History preserved** - Match record shows win/loss stats

---

## 🚀 To Deploy

Run the migration:
```bash
node run-roulette-cleanup-migration.js
```

Or apply SQL directly: `SUPABASE/migrations/update_roulette_cleanup.sql`

---

## 🧪 Edge Cases

### **Player Never Views Results:**
- Data stays indefinitely
- Could add a scheduled job to cleanup after 24 hours
- Or mark as viewed after X days automatically

### **Player Views Multiple Times:**
- Already marked as viewed, no issue
- Cleanup attempts each time they leave

### **Player Disconnects:**
- viewed_results stays FALSE
- Data preserved until they reconnect

---

## 💡 Future Enhancement

Add background cleanup job:
```sql
-- Auto-cleanup matches older than 24 hours
DELETE FROM roulette_participants 
WHERE match_id IN (
  SELECT id FROM roulette_matches 
  WHERE completed_at < NOW() - INTERVAL '24 hours'
);
```

This ensures data doesn't stay forever if someone never views results!

