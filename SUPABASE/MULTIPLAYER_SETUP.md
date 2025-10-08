# Multiplayer System Setup

This document outlines the multiplayer system implementation for Doodle Duel.

## Overview

The multiplayer system allows users to:
1. Find and join live multiplayer matches
2. Draw against other players in real-time
3. View results and rankings after matches

## Database Schema

### Matches Table
```sql
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'multiplayer',
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed')),
  max_players INTEGER NOT NULL DEFAULT 2,
  word TEXT NOT NULL,
  difficulty TEXT DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Match Participants Table
```sql
CREATE TABLE public.match_participants (
  id SERIAL PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  drawing_id UUID REFERENCES public.drawings(id),
  submitted BOOLEAN DEFAULT FALSE,
  score INTEGER,
  position INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);
```

## Edge Functions

### Matchmaking Function
Located at: `SUPABASE/functions/matchmaking/index.ts`

**Actions:**
- `find_or_create_match`: Find existing match or create new one
- `join_match`: Join an existing match
- `get_match_status`: Get current match status
- `get_match_results`: Get final match results

## Screens

### 1. MultiplayerScreen
- Entry point for multiplayer
- Shows "Find Match" button
- Displays match status and participants
- Handles matchmaking logic

### 2. MultiplayerDrawingScreen
- Drawing interface for multiplayer matches
- 1-minute timer with auto-submit
- Real-time opponent status updates
- SVG-based drawing system

### 3. MultiplayerResultsScreen
- Shows final results and rankings
- Displays all participants' drawings
- Provides "Play Again" and "Home" options

## Navigation Flow

1. **Home** → **Multiplayer** (via button)
2. **Multiplayer** → **MultiplayerDrawing** (when match starts)
3. **MultiplayerDrawing** → **MultiplayerResults** (after submission)
4. **MultiplayerResults** → **Multiplayer** (Play Again) or **Home**

## Setup Instructions

### 1. Database Migration
Run the migration to create the required tables:
```bash
supabase db push
```

### 2. Deploy Edge Functions
```bash
cd SUPABASE/functions
./deploy.sh
```

### 3. Update Navigation
The navigation has been updated in `NAVIGATION/rootNavigator.tsx` to include:
- MultiplayerScreen
- MultiplayerDrawingScreen  
- MultiplayerResultsScreen

### 4. Home Screen Update
The HomeScreen now includes a "Multiplayer" button that navigates to the multiplayer flow.

## Key Features

### Matchmaking Logic
- Users click "Find Match" to search for opponents
- System looks for existing waiting matches first
- If no match found, creates new match
- Automatically adds user to match

### Real-time Updates
- Match status polling every 2 seconds
- Opponent submission status updates
- Automatic navigation when match starts/completes

### Drawing System
- SVG-based drawing with touch events
- 1-minute timer with auto-submit
- Clear and submit functionality
- Real-time opponent status

### Results System
- AI scoring integration (placeholder)
- Position-based rankings
- Drawing display (SVG preview)
- Play again functionality

## Security

- Row Level Security (RLS) enabled on all tables
- Users can only view matches they participate in
- Secure edge function authentication
- Input validation and error handling

## Future Enhancements

1. **Real-time WebSocket Updates**: Replace polling with WebSocket connections
2. **Advanced AI Scoring**: Integrate with actual AI scoring service
3. **Tournament Mode**: Support for larger matches (4+ players)
4. **Spectator Mode**: Allow users to watch ongoing matches
5. **Match History**: Track and display past matches
6. **Leaderboards**: Global and friend leaderboards
7. **Custom Match Settings**: Difficulty selection, time limits, etc.

## Testing

To test the multiplayer system:

1. Deploy the database migration
2. Deploy the edge functions
3. Run the app on two devices/simulators
4. Have both users click "Find Match"
5. Verify they get matched together
6. Test the drawing and results flow

## Troubleshooting

### Common Issues

1. **Match not found**: Check edge function deployment
2. **Drawing not submitting**: Verify SVG generation
3. **Results not loading**: Check match status and permissions
4. **Navigation errors**: Verify screen names in navigator

### Debug Steps

1. Check Supabase logs for edge function errors
2. Verify database permissions and RLS policies
3. Test with console.log statements in screens
4. Check network requests in developer tools
