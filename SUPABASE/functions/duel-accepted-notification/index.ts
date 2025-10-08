import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('✅ Duel accepted notification function called');
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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

    // Get the request body
    const body = await req.json();
    console.log('Request body:', body);
    
    const { duel_id } = body;

    if (!duel_id) {
      console.error('Missing duel_id');
      return new Response(
        JSON.stringify({ error: 'Missing duel_id' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get duel details
    console.log('Looking up duel:', duel_id);
    const { data: duelData, error: duelError } = await supabaseClient
      .from('duels')
      .select('id, challenger_id, opponent_id, word, gamemode')
      .eq('id', duel_id)
      .single()

    if (duelError || !duelData) {
      console.error('Duel not found:', duelError);
      return new Response(
        JSON.stringify({ error: 'Duel not found', details: duelError?.message }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get opponent username (the one who accepted)
    const { data: opponentData, error: opponentError } = await supabaseClient
      .from('profiles')
      .select('username')
      .eq('id', duelData.opponent_id)
      .single()

    if (opponentError || !opponentData) {
      console.error('Opponent not found:', opponentError);
      return new Response(
        JSON.stringify({ error: 'Opponent not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get challenger's expo push token (the one who gets notified)
    const { data: challengerData, error: challengerError } = await supabaseClient
      .from('profiles')
      .select('expoPushToken')
      .eq('id', duelData.challenger_id)
      .single()

    if (challengerError || !challengerData) {
      console.error('Challenger not found:', challengerError);
      return new Response(
        JSON.stringify({ error: 'Challenger not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!challengerData.expoPushToken) {
      console.log('Challenger has no push token');
      return new Response(
        JSON.stringify({ success: true, message: 'No push token available' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Send push notification
    const gameModeText = duelData.gamemode === 'doodleDuel' ? 'Doodle Duel' : 'Doodle Hunt';
    const screenName = duelData.gamemode === 'doodleDuel' ? 'DoodleDuelFriend' : 'DoodleHuntFriend';
    
    const notificationData = {
      to: challengerData.expoPushToken,
      title: 'Duel Accepted! 🎯',
      body: `${opponentData.username} accepted your ${gameModeText} challenge!`,
      data: {
        type: 'duel_accepted',
        duel_id: duel_id,
        opponent_username: opponentData.username,
        gamemode: duelData.gamemode,
        screen: screenName,
        params: { duelId: duel_id }
      },
      sound: 'default',
      badge: 1,
    }

    console.log('Sending push notification:', notificationData);

    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notificationData),
    })

    if (!expoResponse.ok) {
      const errorText = await expoResponse.text()
      console.error('Expo push notification failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to send push notification', expoError: errorText }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const expoResult = await expoResponse.json()
    console.log('Push notification sent successfully:', expoResult)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Duel accepted notification sent',
        opponent: opponentData.username,
        expoResult 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Duel accepted notification function error:', error)
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
