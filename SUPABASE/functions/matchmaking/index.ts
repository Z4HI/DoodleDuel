import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('Edge function called with method:', req.method)
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Creating Supabase client...')
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    console.log('Getting current user...')
    // Get the current user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    console.log('User auth result:', { user: user?.id, error: authError })
    
    if (authError || !user) {
      console.log('Authentication failed:', authError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Parsing request body...')
    const requestBody = await req.json()
    console.log('Request body:', requestBody)
    
    const { action, matchType = 'multiplayer', difficulty = 'easy', matchId, maxPlayers = 2 } = requestBody
    console.log('Extracted params:', { action, matchType, difficulty, matchId, maxPlayers })

    switch (action) {
      case 'find_or_create_match':
        return await handleFindOrCreateMatch(supabaseClient, user.id, matchType, difficulty, maxPlayers)
      
      case 'join_match':
        return await handleJoinMatch(supabaseClient, user.id, matchId)
      
      case 'leave_match':
        return await handleLeaveMatch(supabaseClient, user.id, matchId)
      
      case 'cleanup_waiting_matches':
        return await handleCleanupWaitingMatches(supabaseClient, user.id)
      
      case 'cleanup_all_waiting_matches':
        return await handleCleanupAllWaitingMatches(supabaseClient, user.id)
      
      case 'get_match_status':
        return await handleGetMatchStatus(supabaseClient, user.id, matchId)
      
      case 'get_match_results':
        return await handleGetMatchResults(supabaseClient, user.id, matchId)
      
      case 'submit_match_drawing':
        return await handleSubmitMatchDrawing(supabaseClient, user.id, requestBody)
      
      // Roulette game mode actions
      case 'find_or_create_roulette':
        return await handleFindOrCreateRoulette(supabaseClient, user.id, maxPlayers)
      
      case 'leave_roulette_match':
        return await handleLeaveRouletteMatch(supabaseClient, user.id, matchId)
      
      case 'get_roulette_status':
        return await handleGetRouletteStatus(supabaseClient, user.id, matchId)
      
      case 'submit_roulette_turn':
        return await handleSubmitRouletteTurn(supabaseClient, user.id, requestBody)
      
      case 'add_roulette_stroke':
        return await handleAddRouletteStroke(supabaseClient, user.id, requestBody)
      
      case 'complete_roulette_match':
        return await handleCompleteRouletteMatch(supabaseClient, user.id, requestBody)
      
      case 'mark_results_viewed':
        return await handleMarkResultsViewed(supabaseClient, user.id, requestBody)
      
      // Doodle Hunt Friend Roulette actions
      case 'get_doodle_hunt_friend_status':
        return await handleGetDoodleHuntFriendStatus(supabaseClient, user.id, matchId)
      
      case 'submit_doodle_hunt_friend_turn':
        return await handleSubmitDoodleHuntFriendTurn(supabaseClient, user.id, requestBody)
      
      case 'add_doodle_hunt_friend_stroke':
        return await handleAddDoodleHuntFriendStroke(supabaseClient, user.id, requestBody)
      
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
    }
  } catch (error) {
    console.error('Matchmaking function error:', error)
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function handleFindOrCreateMatch(supabaseClient: any, userId: string, matchType: string, difficulty: string, maxPlayers: number = 2) {
  try {
    console.log('handleFindOrCreateMatch called with:', { userId, matchType, difficulty, maxPlayers })
    
    // First, let's test if the function exists by checking the database
    console.log('Testing database connection...')
    const { data: testData, error: testError } = await supabaseClient
      .from('matches')
      .select('id')
      .limit(1)
    
    console.log('Database test result:', { testData, testError })
    
    if (testError) {
      console.error('Database connection failed:', testError)
      return new Response(
        JSON.stringify({ 
          error: 'Database connection failed', 
          details: testError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    // Test if the function exists by calling it with a simple test
    console.log('Testing database function existence...')
    try {
      const { data: testData, error: testError } = await supabaseClient
        .from('words')
        .select('word')
        .eq('difficulty', difficulty)
        .limit(1)
      
      console.log('Words table test:', { testData, testError })
      
      if (testError) {
        console.error('Words table access failed:', testError)
        return new Response(
          JSON.stringify({ 
            error: 'Database access failed',
            details: testError.message 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    } catch (testErr) {
      console.error('Database test failed:', testErr)
      return new Response(
        JSON.stringify({ 
          error: 'Database test failed',
          details: testErr.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    console.log('Calling find_or_create_match function...')
    console.log('Function parameters:', { match_type: matchType, difficulty_level: difficulty, max_players_count: maxPlayers })
    
    const { data, error } = await supabaseClient.rpc('find_or_create_match', {
      match_type: matchType,
      difficulty_level: difficulty,
      max_players_count: maxPlayers
    })
    
    console.log('find_or_create_match result:', { data, error })

    if (error) {
      console.error('Error finding/creating match:', error)
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      
      // Return more detailed error information
      return new Response(
        JSON.stringify({ 
          error: 'Database function failed',
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          fullError: error
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if data exists and is an array
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.error('No data returned from function:', { data, type: typeof data })
      return new Response(
        JSON.stringify({ 
          error: 'No match data returned',
          details: 'Function returned empty or invalid data',
          data: data
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const match = data[0]
    console.log('Match data:', match)
    
    if (!match) {
      return new Response(
        JSON.stringify({ 
          error: 'Failed to create or find match',
          details: 'Match data is null or undefined'
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // If this is a new match, the user is automatically added by the database function
    // If this is an existing match, we need to join it
    if (!match.is_new_match) {
      console.log('Joining existing match:', match.match_id)
      const joinResult = await supabaseClient.rpc('join_match', {
        target_match_id: match.match_id
      })

      console.log('Join match result:', joinResult)

      if (joinResult.error) {
        console.error('Error joining match:', joinResult.error)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to join match',
            details: joinResult.error.message 
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    } else {
      console.log('Created new match, user automatically added by database function')
    }

    // Get match details with participants
    console.log('Fetching match details for:', match.match_id)
    const { data: matchData, error: matchError } = await supabaseClient
      .from('matches')
      .select(`
        *,
        match_participants (
          id,
          user_id,
          submitted,
          profiles!match_participants_user_id_fkey (
            username
          )
        )
      `)
      .eq('id', match.match_id)
      .single()

    console.log('Match details query result:', { matchData, matchError })

    if (matchError) {
      console.error('Error fetching match details:', matchError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch match details',
          details: matchError.message,
          code: matchError.code
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!matchData) {
      console.error('No match data returned from query')
      return new Response(
        JSON.stringify({ 
          error: 'Match not found',
          details: 'Match data is null'
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        match: {
          id: matchData.id,
          word: matchData.word,
          status: matchData.status,
          max_players: matchData.max_players,
          participants: matchData.match_participants,
          isNewMatch: match.is_new_match
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleFindOrCreateMatch:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleJoinMatch(supabaseClient: any, userId: string, matchId: string) {
  try {
    const { error } = await supabaseClient.rpc('join_match', {
      target_match_id: matchId
    })

    if (error) {
      console.error('Error joining match:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleJoinMatch:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleLeaveMatch(supabaseClient: any, userId: string, matchId: string) {
  try {
    const { error } = await supabaseClient.rpc('leave_match', {
      target_match_id: matchId
    })

    if (error) {
      console.error('Error leaving match:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleLeaveMatch:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleCleanupWaitingMatches(supabaseClient: any, userId: string) {
  try {
    const { error } = await supabaseClient.rpc('cleanup_user_waiting_matches')

    if (error) {
      console.error('Error cleaning up waiting matches:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleCleanupWaitingMatches:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleCleanupAllWaitingMatches(supabaseClient: any, userId: string) {
  try {
    const { error } = await supabaseClient.rpc('cleanup_all_user_waiting_matches')

    if (error) {
      console.error('Error cleaning up all waiting matches:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleCleanupAllWaitingMatches:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleGetMatchStatus(supabaseClient: any, userId: string, matchId: string) {
  try {
    const { data, error } = await supabaseClient
      .from('matches')
      .select(`
        *,
        match_participants (
          id,
          user_id,
          submitted,
          profiles!match_participants_user_id_fkey (
            username
          )
        )
      `)
      .eq('id', matchId)
      .single()

    if (error) {
      console.error('Error fetching match status:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        match: data
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleGetMatchStatus:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleGetMatchResults(supabaseClient: any, userId: string, matchId: string) {
  try {
    const { data, error } = await supabaseClient.rpc('get_match_results', {
      target_match_id: matchId
    })

    if (error) {
      console.error('Error fetching match results:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        results: data
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleGetMatchResults:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleSubmitMatchDrawing(supabaseClient: any, userId: string, requestBody: any) {
  try {
    const { matchId, svgUrl, aiScore, aiMessage } = requestBody
    
    if (!matchId || !svgUrl || aiScore === undefined || !aiMessage) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Call the database function to submit the drawing
    const { data, error } = await supabaseClient.rpc('submit_match_drawing', {
      target_match_id: matchId,
      svg_url: svgUrl,
      ai_score: aiScore,
      ai_message: aiMessage
    })

    if (error) {
      console.error('Error submitting match drawing:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to submit drawing',
          details: error.message 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        drawing_id: data 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleSubmitMatchDrawing:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

// ============================================================================
// ROULETTE GAME MODE HANDLERS
// ============================================================================

async function handleFindOrCreateRoulette(supabaseClient: any, userId: string, maxPlayers: number) {
  try {
    console.log('Finding or creating roulette match for user:', userId, 'maxPlayers:', maxPlayers)

    const { data, error } = await supabaseClient.rpc('find_or_create_roulette_match', {
      max_players_count: maxPlayers,
      calling_user_id: userId
    })

    if (error) {
      console.error('Error finding/creating roulette match:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to find/create match',
          details: error.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!data || data.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No match data returned' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const matchData = data[0]

    // Create admin client to bypass RLS for fetching match details
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Get full match details with participants (using admin client to bypass RLS)
    const { data: fullMatch, error: matchError } = await supabaseAdmin
      .from('roulette_matches')
      .select(`
        *,
        roulette_participants (
          id,
          user_id,
          turn_position,
          is_active,
          profiles!roulette_participants_user_id_fkey (
            username
          )
        )
      `)
      .eq('id', matchData.result_match_id)
      .single()

    if (matchError) {
      console.error('Error fetching match details:', matchError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch match details',
          details: matchError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        match: fullMatch,
        participants: fullMatch.roulette_participants,
        isNewMatch: matchData.result_is_new_match
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleFindOrCreateRoulette:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleLeaveRouletteMatch(supabaseClient: any, userId: string, matchId: string) {
  try {
    const { data, error } = await supabaseClient.rpc('leave_roulette_match', {
      target_match_id: matchId
    })

    if (error) {
      console.error('Error leaving roulette match:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to leave match',
          details: error.message 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleLeaveRouletteMatch:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleGetRouletteStatus(supabaseClient: any, userId: string, matchId: string) {
  try {
    // Create admin client to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Query match details directly (simpler than using the JSON function)
    const { data: matchData, error: matchError } = await supabaseAdmin
      .from('roulette_matches')
      .select(`
        *,
        roulette_participants (
          id,
          user_id,
          turn_position,
          is_active,
          profiles!roulette_participants_user_id_fkey (
            username
          )
        )
      `)
      .eq('id', matchId)
      .single()

    if (matchError) {
      console.error('Error getting roulette match:', matchError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to get match status',
          details: matchError.message 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get turns history
    const { data: turns, error: turnsError } = await supabaseAdmin
      .from('roulette_turns')
      .select('*')
      .eq('match_id', matchId)
      .order('turn_number', { ascending: true })

    console.log('Roulette status response:', {
      match_id: matchData.id,
      status: matchData.status,
      winner_id: matchData.winner_id,
      participants_count: matchData.roulette_participants?.length,
      participants: matchData.roulette_participants?.map(p => ({
        user_id: p.user_id,
        username: p.profiles?.username
      }))
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        match: matchData,
        participants: matchData.roulette_participants,
        turns: turns || []
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleGetRouletteStatus:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleSubmitRouletteTurn(supabaseClient: any, userId: string, requestBody: any) {
  try {
    const { matchId, svgUrl, pathsJson, aiGuess, similarityScore } = requestBody

    if (!matchId || pathsJson === undefined || !aiGuess || similarityScore === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    // svgUrl can be empty for empty drawings

    // Submit the turn
    const { data: turnId, error } = await supabaseClient.rpc('submit_roulette_turn', {
      target_match_id: matchId,
      svg_url: svgUrl,
      paths_json: pathsJson,
      ai_guess_text: aiGuess,
      similarity_num: similarityScore,
      calling_user_id: userId
    })

    if (error) {
      console.error('Error submitting roulette turn:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to submit turn',
          details: error.message 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if the guess was correct (winning condition)
    const wasCorrect = similarityScore >= 100

    if (wasCorrect) {
      // Complete the match with this user as winner
      await supabaseClient.rpc('complete_roulette_match', {
        target_match_id: matchId,
        winner_user_id: userId
      })

      // DON'T cleanup immediately - wait for all players to view results

      return new Response(
        JSON.stringify({ 
          success: true,
          turnId: turnId,
          gameOver: true,
          winner: userId
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    } else {
      // Advance to next turn (this may complete the match if turn limit is reached)
      console.log('Advancing turn for match:', matchId)
      const { data: advanceResult, error: advanceError } = await supabaseClient.rpc('advance_roulette_turn', {
        target_match_id: matchId
      })

      if (advanceError) {
        console.error('Error advancing turn:', advanceError)
        
        // Check if the match was completed despite the advancement error
        // This can happen when the turn limit is reached
        const { data: matchCheck, error: checkError } = await supabaseClient
          .from('roulette_matches')
          .select('status, winner_id, current_turn_index, turn_number')
          .eq('id', matchId)
          .single()

        if (checkError) {
          console.error('Error checking match status after advancement error:', checkError)
        }

        console.log('Match status after advancement error:', matchCheck)
        
        // If the match is completed, the turn was submitted successfully
        if (matchCheck?.status === 'completed') {
          console.log('Match completed despite advancement error, turn submitted successfully')
          
          return new Response(
            JSON.stringify({ 
              success: true,
              turnId: turnId,
              gameOver: true,
              turnLimitReached: true
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        
        // For other errors, return the error
        return new Response(
          JSON.stringify({ 
            error: 'Failed to advance turn',
            details: advanceError.message 
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      console.log('Turn advancement result:', advanceResult)

      // Check if the match ended due to turn limit
      const { data: matchCheck, error: checkError } = await supabaseClient
        .from('roulette_matches')
        .select('status, winner_id, current_turn_index, turn_number')
        .eq('id', matchId)
        .single()

      if (checkError) {
        console.error('Error checking match status:', checkError)
      }

      console.log('Match status after turn advancement:', matchCheck)
      const gameOver = matchCheck?.status === 'completed'

      if (gameOver) {
        console.log('Game ended due to turn limit. Winner:', matchCheck.winner_id)
        
        // DON'T cleanup immediately - wait for all players to view results
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          turnId: turnId,
          gameOver: gameOver,
          winner: gameOver ? matchCheck.winner_id : null,
          turnLimitReached: gameOver
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
  } catch (error) {
    console.error('Error in handleSubmitRouletteTurn:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleAddRouletteStroke(supabaseClient: any, userId: string, requestBody: any) {
  try {
    const { matchId, turnNumber, strokeData, strokeIndex } = requestBody

    if (!matchId || turnNumber === undefined || !strokeData || strokeIndex === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate stroke data structure
    if (!strokeData.path || !strokeData.color || typeof strokeData.strokeWidth !== 'number') {
      console.error('Invalid stroke data structure:', strokeData)
      return new Response(
        JSON.stringify({ 
          error: 'Invalid stroke data structure',
          details: 'strokeData must have path, color, and strokeWidth'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Adding stroke to database:', {
      matchId,
      turnNumber,
      strokeIndex,
      strokeDataType: typeof strokeData,
      hasPath: !!strokeData.path,
      hasColor: !!strokeData.color,
      hasStrokeWidth: typeof strokeData.strokeWidth === 'number'
    })

    const { error } = await supabaseClient
      .from('roulette_drawing_strokes')
      .insert({
        match_id: matchId,
        turn_number: turnNumber,
        stroke_data: strokeData,
        stroke_index: strokeIndex
      })

    if (error) {
      console.error('Error adding stroke:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to add stroke',
          details: error.message 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Stroke added successfully')

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleAddRouletteStroke:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleMarkResultsViewed(supabaseClient: any, userId: string, requestBody: any) {
  try {
    const { matchId } = requestBody

    if (!matchId) {
      return new Response(
        JSON.stringify({ error: 'Missing match ID' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Marking results viewed for user:', userId, 'match:', matchId)

    // Mark that this user has viewed the results
    const { error } = await supabaseClient.rpc('mark_roulette_results_viewed', {
      target_match_id: matchId,
      calling_user_id: userId
    })

    if (error) {
      console.error('Error marking results viewed:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to mark results viewed',
          details: error.message 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Try to cleanup - it will only succeed if all players have viewed
    const { data: cleanupResult } = await supabaseClient.rpc('cleanup_roulette_match', {
      target_match_id: matchId
    })

    console.log('Cleanup attempt result:', cleanupResult)

    // If cleanup succeeded, delete SVG files from storage
    if (cleanupResult) {
      console.log('All players viewed results, cleaning up SVG files...')
      
      // Get all turn SVG URLs before they're deleted
      const { data: turns } = await supabaseClient
        .from('roulette_turns')
        .select('svg_url')
        .eq('match_id', matchId)

      if (turns && turns.length > 0) {
        const filesToDelete = turns
          .filter(turn => turn.svg_url)
          .map(turn => {
            const urlParts = turn.svg_url.split('/')
            return urlParts[urlParts.length - 1]
          })

        if (filesToDelete.length > 0) {
          try {
            await supabaseClient.storage.from('drawings').remove(filesToDelete)
            console.log('Deleted SVG files:', filesToDelete)
          } catch (storageError) {
            console.error('Error deleting SVG files from storage:', storageError)
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        cleaned_up: cleanupResult || false
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleMarkResultsViewed:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleCompleteRouletteMatch(supabaseClient: any, userId: string, requestBody: any) {
  try {
    const { matchId, winnerId } = requestBody

    if (!matchId) {
      return new Response(
        JSON.stringify({ error: 'Missing match ID' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Complete the match
    await supabaseClient.rpc('complete_roulette_match', {
      target_match_id: matchId,
      winner_user_id: winnerId || null
    })

    // DON'T cleanup immediately - wait for all players to view results

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleCompleteRouletteMatch:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

// ============================================================================
// DOODLE HUNT FRIEND ROULETTE HANDLERS
// ============================================================================

async function handleGetDoodleHuntFriendStatus(supabaseClient: any, userId: string, duelId: string) {
  try {
    if (!duelId) {
      return new Response(
        JSON.stringify({ error: 'Missing duel ID' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create admin client to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Get duel details
    const { data: duelData, error: duelError } = await supabaseAdmin
      .from('duels')
      .select('*')
      .eq('id', duelId)
      .single()

    if (duelError) {
      console.error('Error getting duel:', duelError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to get duel status',
          details: duelError.message 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get turns history
    const { data: turns, error: turnsError } = await supabaseAdmin
      .from('doodle_hunt_friend_turns')
      .select('*')
      .eq('duel_id', duelId)
      .order('turn_number', { ascending: true })

    console.log('Doodle Hunt Friend status response:', {
      duel_id: duelData.id,
      status: duelData.status,
      winner_id: duelData.winner_id,
      current_turn_index: duelData.current_turn_index,
      roulette_turn_number: duelData.roulette_turn_number
    })

    return new Response(
      JSON.stringify({ 
        success: true,
        duel: duelData,
        turns: turns || []
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleGetDoodleHuntFriendStatus:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleSubmitDoodleHuntFriendTurn(supabaseClient: any, userId: string, requestBody: any) {
  try {
    const { duelId, svgUrl, pathsJson, aiGuess, similarityScore } = requestBody

    if (!duelId || pathsJson === undefined || !aiGuess || similarityScore === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Submit the turn
    const { data: turnId, error } = await supabaseClient.rpc('submit_doodle_hunt_friend_turn', {
      target_duel_id: duelId,
      svg_url: svgUrl,
      paths_json: pathsJson,
      ai_guess_text: aiGuess,
      similarity_num: similarityScore,
      calling_user_id: userId
    })

    if (error) {
      console.error('Error submitting Doodle Hunt Friend turn:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to submit turn',
          details: error.message 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if the guess was correct (winning condition)
    const wasCorrect = similarityScore >= 100

    if (wasCorrect) {
      // Complete the duel with this user as winner
      await supabaseClient.rpc('complete_doodle_hunt_friend_match', {
        target_duel_id: duelId,
        winner_user_id: userId
      })

      return new Response(
        JSON.stringify({ 
          success: true,
          turnId: turnId,
          gameOver: true,
          winner: userId
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    } else {
      // Advance to next turn
      console.log('Advancing turn for duel:', duelId)
      const { data: advanceResult, error: advanceError } = await supabaseClient.rpc('advance_doodle_hunt_friend_turn', {
        target_duel_id: duelId
      })

      if (advanceError) {
        console.error('Error advancing turn:', advanceError)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to advance turn',
            details: advanceError.message 
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          turnId: turnId,
          gameOver: false
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
  } catch (error) {
    console.error('Error in handleSubmitDoodleHuntFriendTurn:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleAddDoodleHuntFriendStroke(supabaseClient: any, userId: string, requestBody: any) {
  try {
    const { duelId, turnNumber, strokeData, strokeIndex } = requestBody

    if (!duelId || turnNumber === undefined || !strokeData || strokeIndex === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate stroke data structure
    if (!strokeData.path || !strokeData.color || typeof strokeData.strokeWidth !== 'number') {
      console.error('Invalid stroke data structure:', strokeData)
      return new Response(
        JSON.stringify({ 
          error: 'Invalid stroke data structure',
          details: 'strokeData must have path, color, and strokeWidth'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Adding stroke to database:', {
      duelId,
      turnNumber,
      strokeIndex,
      strokeDataType: typeof strokeData,
      hasPath: !!strokeData.path,
      hasColor: !!strokeData.color,
      hasStrokeWidth: typeof strokeData.strokeWidth === 'number'
    })

    const { error } = await supabaseClient
      .from('doodle_hunt_friend_strokes')
      .insert({
        duel_id: duelId,
        turn_number: turnNumber,
        stroke_data: strokeData,
        stroke_index: strokeIndex
      })

    if (error) {
      console.error('Error adding stroke:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to add stroke',
          details: error.message 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Stroke added successfully')

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in handleAddDoodleHuntFriendStroke:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}
