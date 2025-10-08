# Word of the Day System Setup

This document explains how to set up and use the Word of the Day system for your Doodle Duel app.

## Overview

The Word of the Day system automatically updates the daily drawing challenge word every day at 12 AM. It includes:

1. A `word_of_the_day` table to track daily words
2. Database functions to manage word selection
3. A Supabase Edge Function to update words
4. Automated scheduling via cron jobs
5. Updated React Native screen to fetch the current word

## Setup Instructions

### 1. Run Database Migrations

Execute these SQL files in your Supabase SQL Editor in order:

```sql
-- 1. First, run the words table migration (if not already done)
-- File: SUPABASE/migrations/create_words_table.sql

-- 2. Create the word of the day system
-- File: SUPABASE/migrations/create_word_of_day_system.sql

-- 3. Set up the cron job (choose one option)
-- File: SUPABASE/migrations/setup_word_of_day_cron.sql
```

### 2. Deploy the Edge Function

Deploy the edge function to handle word updates:

```bash
# Navigate to your project directory
cd /Users/zahi/repos/doodle_duel

# Deploy the update-word-of-day function
supabase functions deploy update-word-of-day
```

### 3. Set up Automated Scheduling

You have two options for automated scheduling:

#### Option A: GitHub Actions (Recommended)

1. Add these secrets to your GitHub repository:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key

2. The GitHub Action workflow is already created at `.github/workflows/update-word-of-day.yml`

#### Option B: pg_cron (If Available)

If your Supabase instance supports pg_cron, the SQL migration will automatically set up a daily cron job.

### 4. Manual Testing

You can manually trigger the word update using the Supabase SQL Editor:

```sql
-- Test the word of the day function
SELECT * FROM public.get_word_of_the_day();

-- Manually trigger an update
SELECT public.trigger_word_of_day_update();

-- Set a specific word for today
SELECT public.set_word_of_the_day('elephant', CURRENT_DATE);
```

## How It Works

### Database Schema

- **`words`**: Contains all available words with difficulty levels
- **`word_of_the_day`**: Tracks which word is assigned to each date

### Daily Process

1. At midnight (00:00 UTC), the cron job triggers
2. The system selects a random word from the `words` table
3. The word is assigned to the current date in `word_of_the_day`
4. The app fetches this word when users open the Word of the Day screen

### API Functions

- `get_word_of_the_day()`: Returns the current day's word
- `set_word_of_the_day(word, date)`: Sets a word for a specific date
- `get_random_word_for_day(difficulty)`: Gets a random word by difficulty
- `cron_update_word_of_day()`: Updates the word (called by cron)

### Edge Function

The `update-word-of-day` edge function:
- Checks if today's word already exists
- Selects a random word if needed
- Updates the database
- Also prepares tomorrow's word for efficiency

## Frontend Integration

The `WordOfTheDayScreen` component now:
- Fetches the current word from the database on load
- Shows loading state while fetching
- Falls back to a default word if there's an error
- Displays error messages if the fetch fails

## Troubleshooting

### Common Issues

1. **No word of the day found**
   - Check if the `words` table has data
   - Verify the `word_of_the_day` table exists
   - Run the migration files again

2. **Cron job not working**
   - Check if pg_cron is enabled in your Supabase instance
   - Use GitHub Actions as an alternative
   - Manually trigger updates for testing

3. **Edge function errors**
   - Verify the function is deployed
   - Check the function logs in Supabase dashboard
   - Ensure service role key has proper permissions

### Manual Word Management

```sql
-- View all words
SELECT * FROM public.words ORDER BY difficulty, word;

-- View word of the day history
SELECT wotd.date, w.word, w.difficulty, w.category
FROM public.word_of_the_day wotd
JOIN public.words w ON wotd.word_id = w.id
ORDER BY wotd.date DESC;

-- Add new words
INSERT INTO public.words (word, difficulty, category) VALUES
('elephant', 'medium', 'animals'),
('mountain', 'medium', 'nature');

-- Remove a word from today
DELETE FROM public.word_of_the_day WHERE date = CURRENT_DATE;
```

## Configuration

### Difficulty Levels

The system supports three difficulty levels:
- `easy`: Simple words (cat, dog, house)
- `medium`: Moderate words (elephant, mountain, bicycle)
- `hard`: Complex words (butterfly, skyscraper, microscope)

### Scheduling

The default schedule is daily at midnight UTC. To change this:

1. **GitHub Actions**: Edit `.github/workflows/update-word-of-day.yml`
2. **pg_cron**: Update the cron expression in the SQL migration

### Timezone Considerations

- Cron jobs run in UTC
- Adjust the schedule based on your target timezone
- Consider your user base's primary timezone for the best experience

## Monitoring

Monitor the system by:

1. Checking the Supabase function logs
2. Viewing the `word_of_the_day` table for recent updates
3. Testing the frontend loading behavior
4. Verifying cron job execution (if using pg_cron)

## Future Enhancements

Potential improvements:
- Word categories for themed days
- User preferences for difficulty
- Historical word tracking
- Analytics on word popularity
- Multi-language support
