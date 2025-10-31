# Database Migrations

This directory contains all SQL migrations for the Doodle Duel database.

## 📁 Directory Structure

```
migrations/
├── core/           # Core system creation (run first)
├── updates/        # Important updates and fixes (run after core)
├── archive/        # Old incremental migrations (for reference only)
└── README.md       # This file
```

## 🎯 Migration Organization

### **Core Migrations** (`core/`)
**15 files** - Essential database tables, functions, and systems

These should be run when setting up a new database:

#### 1. Words & Game Content
- `create_words_table.sql` - Base words table
- `create_wordlevels_table.sql` - Word levels/difficulties
- `insert_wordlevels_data.sql` - Populate word levels
- `create_word_of_day_system.sql` - Daily word challenges
- `setup_word_of_day_cron.sql` - Automated word rotation

#### 2. Game Modes
- `create_doodle_hunt_system.sql` - Solo doodle hunt
- `create_doodle_hunt_daily_system.sql` - Daily challenges
- `create_doodle_hunt_dash_games.sql` - Dash mode games
- `create_doodle_hunt_dash_guesses.sql` - Dash mode guesses
- `create_doodle_hunt_duel_system.sql` - 1v1 duel mode
- `create_doodle_hunt_friend_roulette_system.sql` - Friend roulette mode

#### 3. Multiplayer Systems
- `create_duels_system.sql` - Duel framework
- `create_friends_system.sql` - Friend connections
- `create_multiplayer_system.sql` - Multiplayer matches
- `20240115_create_roulette_tables.sql` - Roulette mode (2-4 players)

#### 4. User Features
- `allow_user_search.sql` - User search functionality

---

### **Update Migrations** (`updates/`)
**10 files** - Important updates, fixes, and new features

Run these after core migrations to add features and fixes:

#### Feature Additions
- `00_hint_system_complete.sql` ⭐ - Complete hint system
  - Adds hint/hint_used columns
  - Unlock hints with tokens or ads
  - Both regular and dash modes

- `add_xp_tier_streaks.sql` - XP, tiers, and streak multipliers
- `fix_guesses_left_comprehensive.sql` ⭐ - Guesses limiting system
  - Adds guesses_left column
  - Updates all game functions
  - Reset function for ads/tokens

- `add_profiles_foreign_key.sql` - Proper profile relationships

#### Roulette Mode Updates
- `fix_roulette_rls_and_realtime.sql` ⭐ - RLS policies & realtime
- `fix_roulette_function_auth.sql` ⭐ - Auth context fixes
- `add_leave_match_function.sql` - Leave match functionality
- `add_max_players_parameter.sql` - 2 or 4 player support
- `add_roulette_turn_limit.sql` - Turn limits per match
- `update_roulette_cleanup.sql` - Automatic match cleanup

#### Friend Duel Updates
- `add_doodle_hunt_friend_turn_limit.sql` ⭐ - 10 turn limit for Doodle Hunt friend duels

⭐ = Comprehensive/consolidated migration

---

### **Archive** (`archive/`)
**29 files** - Old incremental migrations

These are kept for reference but should **NOT** be run on new databases.

They represent the iterative development history:
- Small column additions
- Individual bug fixes
- Incremental feature development
- Trial-and-error changes

**Note:** The functionality from these files is included in the comprehensive migrations above.

---

## 🚀 Running Migrations

### For New Database Setup

```bash
# Set your service key
export SUPABASE_SERVICE_KEY=your-service-key

# 1. Run all core migrations (in order)
node ../../../run-migration.js core/create_words_table.sql
node ../../../run-migration.js core/create_wordlevels_table.sql
node ../../../run-migration.js core/insert_wordlevels_data.sql
# ... continue with other core files

# 2. Run important update migrations
node ../../../run-migration.js updates/00_hint_system_complete.sql
node ../../../run-migration.js updates/fix_guesses_left_comprehensive.sql
node ../../../run-migration.js updates/add_xp_tier_streaks.sql
# ... etc
```

### For Existing Database

Only run the update migrations you need:

```bash
# Example: Add hint system
node run-migration.js SUPABASE/migrations/updates/00_hint_system_complete.sql

# Example: Fix roulette realtime issues
node run-migration.js SUPABASE/migrations/updates/fix_roulette_rls_and_realtime.sql
```

### Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/_/sql
2. Open the migration file
3. Copy and paste the contents
4. Click "Run"

This is the most reliable method as it doesn't depend on RPC functions.

---

## 📝 Migration Naming Convention

- `create_*.sql` - Creates new tables/systems
- `add_*.sql` - Adds new features/columns
- `fix_*.sql` - Fixes issues or bugs
- `update_*.sql` - Updates existing functionality
- `00_*.sql` - Comprehensive consolidated migrations (run early)

---

## ⚠️ Important Notes

1. **Order matters** - Run core migrations before updates
2. **Don't run archive** - Archive files are for reference only
3. **Check dependencies** - Some updates depend on core systems
4. **Use Supabase Dashboard** - Most reliable way to run migrations
5. **Test first** - Test migrations on a dev database if possible

---

## 🔍 Finding What You Need

**Setting up from scratch?**
→ Run all files in `core/`, then important ones in `updates/`

**Need to add hints?**
→ `updates/00_hint_system_complete.sql`

**Need to limit guesses?**
→ `updates/fix_guesses_left_comprehensive.sql`

**Roulette mode issues?**
→ `updates/fix_roulette_rls_and_realtime.sql`
→ `updates/fix_roulette_function_auth.sql`

**Want to see how something evolved?**
→ Check `archive/` for the development history

---

## 📊 Migration Statistics

- **Total migrations:** 54 files
- **Core systems:** 15 files (~4,000 lines)
- **Active updates:** 10 files (~1,500 lines)
- **Archived:** 29 files (reference only)

**Before cleanup:** 52 flat files in one directory  
**After cleanup:** Organized into 3 clear categories

---

## 🤝 Contributing

When adding new migrations:

1. **New system?** → Add to `core/`
2. **Feature/fix?** → Add to `updates/`
3. **Consolidating?** → Create comprehensive file with clear header
4. **Superseding old files?** → Move them to `archive/`
5. **Update this README** → Keep documentation current

---

## 📚 Related Documentation

- [Roulette Implementation](../../../ROULETTE_2P_VS_4P_COMPATIBILITY.md)
- [Streak Multipliers](../../../STREAK_MULTIPLIER_SYSTEM.md)
- [XP System](../../../MIGRATION_CLEANUP_SUMMARY.md)
- [Migration Runner](../../../run-migration.js)

---

*Last updated: October 14, 2025*
*Cleanup reduced 52 flat files to organized 3-tier structure*

