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
    
    const { action, matchType = 'multiplayer', difficulty = 'easy', matchId } = requestBody
    console.log('Extracted params:', { action, matchType, difficulty, matchId })

    switch (action) {
      case 'find_or_create_match':
        return await handleFindOrCreateMatch(supabaseClient, user.id, matchType, difficulty)
      
      case 'join_match':
        return await handleJoinMatch(supabaseClient, user.id, matchId)
      
      case 'get_match_status':
        return await handleGetMatchStatus(supabaseClient, user.id, matchId)
      
      case 'get_match_results':
        return await handleGetMatchResults(supabaseClient, user.id, matchId)
      
      case 'submit_match_drawing':
        return await handleSubmitMatchDrawing(supabaseClient, user.id, requestBody)
      
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

async function handleFindOrCreateMatch(supabaseClient: any, userId: string, matchType: string, difficulty: string) {
  try {
    console.log('handleFindOrCreateMatch called with:', { userId, matchType, difficulty })
    
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
    console.log('Function parameters:', { match_type: matchType, difficulty_level: difficulty })
    
    const { data, error } = await supabaseClient.rpc('find_or_create_match', {
      match_type: matchType,
      difficulty_level: difficulty
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
