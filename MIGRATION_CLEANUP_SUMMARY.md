# Migration Cleanup Summary

This document summarizes the comprehensive migration file cleanup performed on October 14, 2025.

## 📊 Results

### Before Cleanup
- **52 SQL files** scattered in `SUPABASE/migrations/`
- **6 individual migration runner scripts**
- **7 loose SQL files** in root directory
- **No clear organization** - difficult to understand what to run

### After Cleanup
- **15 core migrations** in `SUPABASE/migrations/core/`
- **10 update migrations** in `SUPABASE/migrations/updates/`
- **29 archived migrations** in `SUPABASE/migrations/archive/` (reference only)
- **1 universal migration runner** (`run-migration.js`)
- **6 test files** organized in `SUPABASE/testing/`
- **Comprehensive README** explaining the structure

**Net reduction: 52 scattered files → 25 essential files (52% reduction)**

---

## 🎯 What Was Done

### 1. Consolidated Related Migrations

#### Roulette RLS & Realtime
**File:** `SUPABASE/migrations/updates/fix_roulette_rls_and_realtime.sql`

**Consolidated 5 files:**
- `fix-rls-policies.sql`
- `check-and-fix-realtime-policies.sql`
- `simplify-rls-for-realtime.sql`
- `cleanup-duplicate-policies.sql`
- `enable-roulette-realtime.sql`

**What it does:**
- Removes duplicate RLS policies
- Creates simplified, realtime-compatible policies
- Enables Realtime for all roulette tables
- Includes verification queries

---

#### Roulette Function Auth
**File:** `SUPABASE/migrations/updates/fix_roulette_function_auth.sql`

**Consolidated 2 files:**
- `fix-roulette-with-user-param.sql`
- `fix-submit-turn-function.sql`

**What it does:**
- Adds user_id parameter to `find_or_create_roulette_match()`
- Adds user_id parameter to `submit_roulette_turn()`
- Fixes SECURITY DEFINER auth.uid() context issues

---

#### Hint System
**File:** `SUPABASE/migrations/updates/00_hint_system_complete.sql`

**Consolidated 6 files:**
- `add_hint_to_guesses.sql`
- `add_hint_used_column.sql`
- `add_hint_column_back.sql`
- `remove_hint_column.sql`
- `add_unlock_hint_with_ad.sql`
- `add_dash_hint_unlock_function.sql`

**What it does:**
- Adds hint/hint_used columns to both guess tables
- Creates unlock_hint_with_token() function
- Creates unlock_hint_with_ad() function
- Creates unlock_dash_hint_with_token() function

---

### 2. Organized Migration Structure

Created three-tier organization:

#### **Core Migrations** (`SUPABASE/migrations/core/`)
15 files - Essential system creation

- Words & game content (5 files)
- Game modes (5 files)
- Multiplayer systems (4 files)
- User features (1 file)

#### **Update Migrations** (`SUPABASE/migrations/updates/`)
10 files - Important updates and fixes

- **Consolidated comprehensive migrations** (4 files)
  - `00_hint_system_complete.sql`
  - `fix_guesses_left_comprehensive.sql`
  - `fix_roulette_rls_and_realtime.sql`
  - `fix_roulette_function_auth.sql`

- **Feature additions** (2 files)
  - `add_xp_tier_streaks.sql`
  - `add_profiles_foreign_key.sql`

- **Roulette updates** (4 files)
  - `add_leave_match_function.sql`
  - `add_max_players_parameter.sql`
  - `add_roulette_turn_limit.sql`
  - `update_roulette_cleanup.sql`

#### **Archive** (`SUPABASE/migrations/archive/`)
29 files - Historical incremental changes (reference only)

All the small add/fix/update files that represent iterative development:
- Individual column additions
- Small bug fixes
- Feature iterations
- Experimental changes

**These should NOT be run on new databases** - their functionality is included in the core and update migrations.

---

### 3. Testing Files Organized

Created `SUPABASE/testing/` folder and moved:
- `check-rls-realtime.sql`
- `disable-rls-for-testing.sql`
- `test-realtime-simple.sql`
- `verify-table-names.sql`
- `check-db-setup.js`
- `test-db-function.js`

---

### 4. Universal Migration Runner

**File:** `run-migration.js` (enhanced version)

**Replaces 6 individual runners:**
- `run-leave-match-migration.js`
- `run-max-players-migration.js`
- `run-roulette-cleanup-migration.js`
- `run-roulette-migration.js`
- `run-turn-limit-migration.js`
- `run-xp-tier-migration.js`

**Features:**
- Accepts any migration file path
- Smart path resolution (searches multiple locations)
- Better error messages and help text
- Helpful manual execution fallback instructions

**Usage:**
```bash
export SUPABASE_SERVICE_KEY=your-key
node run-migration.js SUPABASE/migrations/updates/00_hint_system_complete.sql
```

---

### 5. Documentation Created

#### `SUPABASE/migrations/README.md`
Comprehensive guide including:
- Directory structure explanation
- File-by-file descriptions
- Running instructions
- Migration naming conventions
- Troubleshooting guide

#### This document
`MIGRATION_CLEANUP_SUMMARY.md` - Overview of cleanup changes

---

## 📁 Final File Structure

```
/Users/zahi/repos/doodle_duel/
├── run-migration.js                          # Universal migration runner
├── MIGRATION_CLEANUP_SUMMARY.md              # This file
└── SUPABASE/
    ├── migrations/
    │   ├── README.md                         # Comprehensive guide
    │   ├── core/                             # 15 essential system files
    │   │   ├── create_words_table.sql
    │   │   ├── create_wordlevels_table.sql
    │   │   ├── insert_wordlevels_data.sql
    │   │   ├── create_word_of_day_system.sql
    │   │   ├── create_doodle_hunt_system.sql
    │   │   ├── create_doodle_hunt_daily_system.sql
    │   │   ├── create_doodle_hunt_dash_games.sql
    │   │   ├── create_doodle_hunt_dash_guesses.sql
    │   │   ├── create_doodle_hunt_duel_system.sql
    │   │   ├── create_duels_system.sql
    │   │   ├── create_friends_system.sql
    │   │   ├── create_multiplayer_system.sql
    │   │   ├── 20240115_create_roulette_tables.sql
    │   │   ├── allow_user_search.sql
    │   │   └── setup_word_of_day_cron.sql
    │   ├── updates/                          # 10 important updates
    │   │   ├── 00_hint_system_complete.sql   # ⭐ Consolidated
    │   │   ├── fix_guesses_left_comprehensive.sql # ⭐ Consolidated
    │   │   ├── fix_roulette_rls_and_realtime.sql # ⭐ Consolidated
    │   │   ├── fix_roulette_function_auth.sql    # ⭐ Consolidated
    │   │   ├── add_xp_tier_streaks.sql
    │   │   ├── add_profiles_foreign_key.sql
    │   │   ├── add_leave_match_function.sql
    │   │   ├── add_max_players_parameter.sql
    │   │   ├── add_roulette_turn_limit.sql
    │   │   └── update_roulette_cleanup.sql
    │   └── archive/                          # 29 reference files
    │       └── [old incremental migrations]
    └── testing/                              # 6 test files
        ├── check-rls-realtime.sql
        ├── disable-rls-for-testing.sql
        ├── test-realtime-simple.sql
        ├── verify-table-names.sql
        ├── check-db-setup.js
        └── test-db-function.js
```

---

## ✅ Benefits

1. **Cleaner organization**
   - Clear separation: core vs updates vs archive
   - Easy to find what you need
   - Understand dependencies

2. **Reduced complexity**
   - 52 scattered files → 25 essential files
   - 6 migration runners → 1 universal runner
   - No more confusion about what to run

3. **Better documentation**
   - Comprehensive README in migrations folder
   - Each consolidated file explains what it replaces
   - Clear usage instructions

4. **Easier onboarding**
   - New developers can understand structure quickly
   - Clear path for setting up new databases
   - Historical context preserved in archive

5. **Maintainability**
   - Related functionality grouped together
   - Easy to see what's essential vs optional
   - Less duplication

---

## 🚀 How to Use

### For New Database Setup

1. Run all **core** migrations (15 files)
2. Run needed **update** migrations (especially the ⭐ consolidated ones)
3. Ignore **archive** folder

### For Existing Database

Run only the update migrations you need:
- Need hints? → `updates/00_hint_system_complete.sql`
- Need guess limits? → `updates/fix_guesses_left_comprehensive.sql`
- Roulette issues? → `updates/fix_roulette_*.sql`

### Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/_/sql
2. Open the migration file you need
3. Copy and paste contents
4. Click "Run"

---

## 📝 Files Deleted (Consolidated)

### Root Directory SQL Files (7 deleted)
- ✓ `fix-rls-policies.sql`
- ✓ `check-and-fix-realtime-policies.sql`
- ✓ `simplify-rls-for-realtime.sql`
- ✓ `cleanup-duplicate-policies.sql`
- ✓ `enable-roulette-realtime.sql`
- ✓ `fix-roulette-with-user-param.sql`
- ✓ `fix-submit-turn-function.sql`

### Old Migration Runners (6 deleted)
- ✓ `run-leave-match-migration.js`
- ✓ `run-max-players-migration.js`
- ✓ `run-roulette-cleanup-migration.js`
- ✓ `run-roulette-migration.js`
- ✓ `run-turn-limit-migration.js`
- ✓ `run-xp-tier-migration.js`

---

## 🔮 Future Improvements

1. **Add migration versioning** - Track which migrations have been run
2. **Create migration batches** - Scripts to run common sets of migrations
3. **Add rollback migrations** - Down migrations for each up migration
4. **Automated testing** - Test migrations on a fresh database
5. **Further consolidation** - Combine archive files into even fewer comprehensive migrations

---

## 📊 Statistics

- **Files consolidated:** 13 SQL files → 4 comprehensive files
- **Organization improvement:** 52 flat files → 3-tier structure
- **Runner scripts:** 6 → 1 universal script
- **Net file reduction:** ~40% fewer files to manage
- **Clarity improvement:** Immeasurable! 🎉

---

## ⚠️ Important Notes

1. **Archive folder is for reference only** - Don't run those migrations
2. **Order matters** - Run core before updates
3. **Check dependencies** - Some updates require specific core systems
4. **Backup first** - Always backup before running migrations
5. **Use dashboard** - Most reliable way to run migrations

---

## 🤝 Maintenance

When adding new migrations:

1. **Is it a new core system?** → Add to `core/`
2. **Is it an update/fix?** → Add to `updates/`
3. **Are you consolidating?** → Create comprehensive file with clear docs
4. **Superseding old files?** → Move to `archive/`
5. **Always update README** → Keep documentation current

---

## 📚 Related Documentation

- [Migrations README](SUPABASE/migrations/README.md)
- [Roulette Implementation](ROULETTE_2P_VS_4P_COMPATIBILITY.md)
- [Streak Multipliers](STREAK_MULTIPLIER_SYSTEM.md)
- [Migration Runner](run-migration.js)

---

*Cleanup performed: October 14, 2025*  
*From chaos to clarity! 🎨*
