# 🔥 Daily Streak Multiplier System

## Overview
Reward players for maintaining daily streaks with XP multipliers. Only applies to **Word of the Day** and **Doodle Hunt Daily**.

---

## 📊 Streak Multiplier Table (Option 1: Milestone Bonuses)

| Streak Days | Multiplier | Bonus | Example (100 base XP) |
|-------------|------------|-------|----------------------|
| 1-2 days | 1.0x | +0% | 100 XP |
| 3-6 days | 1.25x | +25% | 125 XP |
| 7-13 days | 1.5x | +50% | 150 XP |
| 14-29 days | 1.75x | +75% | 175 XP |
| 30-59 days | 2.0x | +100% | **200 XP** |
| 60-99 days | 2.5x | +150% | 250 XP |
| 100+ days | 3.0x | +200% | **300 XP** |

---

## 💰 Real XP Examples

### Word of the Day (Base: 100 XP)
| Streak | Multiplier | Final XP |
|--------|------------|----------|
| Day 1 | 1.0x | 100 XP |
| Day 3 | 1.25x | 125 XP |
| Day 7 | 1.5x | 150 XP |
| Day 30 | 2.0x | **200 XP** |
| Day 100 | 3.0x | **300 XP** |

### Doodle Hunt Win (Base: 200 XP)
| Streak | Multiplier | Final XP |
|--------|------------|----------|
| Day 1 | 1.0x | 200 XP |
| Day 7 | 1.5x | 300 XP |
| Day 30 | 2.0x | **400 XP** |
| Day 100 | 3.0x | **600 XP** |

### Doodle Hunt Fast Win (Base: 200 + 50 = 250 XP)
| Streak | Multiplier | Final XP |
|--------|------------|----------|
| Day 7 | 1.5x | 375 XP |
| Day 30 | 2.0x | **500 XP** |
| Day 100 | 3.0x | **750 XP** |

---

## 🎯 Key Milestones

### **Day 3**: First Bonus! 🎉
- Unlocks: 1.25x multiplier
- Message: "3-day streak! +25% XP bonus!"
- Impact: Small but encouraging

### **Day 7**: One Week! 🌟
- Unlocks: 1.5x multiplier
- Message: "7-day streak! +50% XP bonus!"
- Impact: Noticeable reward increase

### **Day 14**: Two Weeks! 🏆
- Unlocks: 1.75x multiplier
- Message: "2-week streak! +75% XP bonus!"
- Impact: Major commitment rewarded

### **Day 30**: ONE MONTH! 💎
- Unlocks: 2.0x multiplier (DOUBLE XP!)
- Message: "30-DAY STREAK! DOUBLE XP UNLOCKED! 🔥🔥"
- Impact: Huge milestone, celebration worthy
- Badge: Special 30-day streak badge?

### **Day 60**: Two Months! ⭐
- Unlocks: 2.5x multiplier
- Message: "60-DAY STREAK! 2.5x XP! 🔥🔥🔥"
- Impact: Elite dedication

### **Day 100**: LEGENDARY! 👑
- Unlocks: 3.0x multiplier (TRIPLE XP!)
- Message: "100-DAY STREAK! LEGENDARY STATUS! 🔥🔥🔥🔥"
- Impact: Top 0.1% of players
- Badge: Legendary streak badge?

---

## 📱 UI Display Ideas

### **On Home Screen:**
```
🔥 7 Days  [+50%]
   ↑        ↑
streak    bonus badge
```

### **After Completing Daily:**
```
┌─────────────────────────┐
│   🎉 XP Earned! 🎉      │
│                         │
│   Base XP:     100      │
│   Streak (7d): +50%     │
│   ─────────────────     │
│   Total:       150 XP   │
│                         │
│   🔥 Keep it going!     │
│   Day 7 → Day 14 = +75% │
└─────────────────────────┘
```

### **In Profile Modal:**
```
🔥 Current Streaks:
Word of Day:  30 days  (2.0x XP!)
Doodle Hunt:  7 days   (1.5x XP!)
```

---

## 🎮 Progression Impact

### **Casual Player (3-7 day streaks)**
```
Without streaks: 100 games to Gold (21,000 XP)
With 7-day bonus: ~75 games (25% faster!)
```

### **Dedicated Player (30-day streak)**
```
Without streaks: 260 games to Diamond
With 30-day bonus: ~165 games (37% faster!)
Double XP is HUGE!
```

### **Elite Player (100-day streak)**
```
Without streaks: 830 games to Legend
With 100-day bonus: ~415 games (50% faster!)
Triple XP = God mode
```

---

## 💡 Additional Ideas

### **Streak Badges:**
- 🥉 3-day streak badge
- 🥈 7-day streak badge  
- 🥇 30-day streak badge
- 💎 100-day streak badge

### **Streak Protection:**
- "Freeze" item (costs tokens) - protect streak for 1 day
- Or: Free 1-day grace period per month

### **Display Next Milestone:**
```
Current: 🔥 5 days (1.25x)
Next: 2 more days to 1.5x! 🎯
```

---

## ⚙️ Implementation

The functions are already in `tierUtils.ts`:
- `getStreakMultiplier(streak)` - Returns multiplier
- `calculateXPWithStreak(baseXP, streak)` - Returns breakdown
- `getNextStreakMilestone(streak)` - For UI display

Want me to integrate this into the XP awarding system now?
