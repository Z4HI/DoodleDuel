import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('Friend request notification function called');
  
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
    
    const { sender_id, receiver_id } = body;

    if (!sender_id || !receiver_id) {
      console.error('Missing required fields:', { sender_id, receiver_id });
      return new Response(
        JSON.stringify({ error: 'Missing required fields', received: { sender_id, receiver_id } }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get sender's username
    console.log('Looking up sender:', sender_id);
    const { data: senderProfile, error: senderError } = await supabaseClient
      .from('profiles')
      .select('username')
      .eq('id', sender_id)
      .single()

    if (senderError || !senderProfile) {
      console.error('Sender not found:', senderError, 'for sender_id:', sender_id);
      return new Response(
        JSON.stringify({ error: 'Sender not found', details: senderError?.message, sender_id }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get receiver's expo push token
    console.log('Looking up receiver:', receiver_id);
    const { data: receiverProfile, error: receiverError } = await supabaseClient
      .from('profiles')
      .select('expoPushToken, username')
      .eq('id', receiver_id)
      .single()

    if (receiverError || !receiverProfile) {
      console.error('Receiver not found:', receiverError, 'for receiver_id:', receiver_id);
      return new Response(
        JSON.stringify({ error: 'Receiver not found', details: receiverError?.message, receiver_id }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!receiverProfile.expoPushToken) {
      console.error('Receiver has no push token:', receiverProfile.username);
      return new Response(
        JSON.stringify({ 
          error: 'Receiver has no push token', 
          receiver_username: receiverProfile.username,
          receiver_id 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate Expo push token format
    if (!receiverProfile.expoPushToken.startsWith('ExponentPushToken[') && 
        !receiverProfile.expoPushToken.startsWith('ExpoPushToken[')) {
      console.error('Invalid Expo push token format:', receiverProfile.expoPushToken);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid Expo push token format', 
          receiver_username: receiverProfile.username,
          token: receiverProfile.expoPushToken.substring(0, 20) + '...'
        }),
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

    console.log('Sending push notification to:', receiverProfile.expoPushToken);
    console.log('Notification data:', notificationData);

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
      console.error('Expo push notification failed:', {
        status: expoResponse.status,
        statusText: expoResponse.statusText,
        error: errorText,
        notificationData
      });
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send push notification', 
          expoError: errorText,
          status: expoResponse.status
        }),
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
    console.error('Error in send-friend-request-notification:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message,
        type: error.name
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
