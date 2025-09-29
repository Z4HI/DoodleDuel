import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FriendRequestNotification {
  sender_id: string;
  receiver_id: string;
  sender_username: string;
  receiver_expo_push_token: string;
}

serve(async (req) => {
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
    const { sender_id, receiver_id } = await req.json()

    if (!sender_id || !receiver_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get sender's username
    const { data: senderProfile, error: senderError } = await supabaseClient
      .from('profiles')
      .select('username')
      .eq('id', sender_id)
      .single()

    if (senderError || !senderProfile) {
      return new Response(
        JSON.stringify({ error: 'Sender not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get receiver's expo push token
    const { data: receiverProfile, error: receiverError } = await supabaseClient
      .from('profiles')
      .select('expoPushToken')
      .eq('id', receiver_id)
      .single()

    if (receiverError || !receiverProfile) {
      return new Response(
        JSON.stringify({ error: 'Receiver not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!receiverProfile.expoPushToken) {
      return new Response(
        JSON.stringify({ error: 'Receiver has no push token' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Send push notification via Expo
    const notificationData = {
      to: receiverProfile.expoPushToken,
      title: 'New Friend Request! 👋',
      body: `${senderProfile.username} wants to be your friend on Doodle Duel`,
      data: {
        type: 'friend_request',
        sender_id: sender_id,
        sender_username: senderProfile.username,
        screen: 'DuelFriend',
        params: { tab: 'requests' }
      },
      sound: 'default',
      badge: 1,
    }

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
      console.error('Expo push notification failed:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to send push notification' }),
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
        message: 'Friend request notification sent',
        expoResult 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in send-friend-request-notification:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
