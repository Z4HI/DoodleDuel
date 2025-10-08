import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with the service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get the current date
    const today = new Date().toISOString().split('T')[0]
    
    console.log(`Updating word of the day for ${today}`)

    // Check if word of the day already exists for today
    const { data: existingWord, error: checkError } = await supabaseClient
      .from('word_of_the_day')
      .select('*')
      .eq('date', today)
      .single()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found"
      throw checkError
    }

    if (existingWord) {
      console.log(`Word of the day already exists for ${today}: ${existingWord.word_id}`)
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Word of the day already exists for ${today}`,
          date: today,
          wordId: existingWord.word_id
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Get a random word for today
    const { data: randomWord, error: wordError } = await supabaseClient
      .rpc('get_random_word_for_day', { difficulty_level: 'easy' })

    if (wordError) {
      throw wordError
    }

    if (!randomWord) {
      throw new Error('No random word returned from database')
    }

    console.log(`Selected random word: ${randomWord}`)

    // Get the word ID from the words table
    const { data: wordData, error: wordDataError } = await supabaseClient
      .from('words')
      .select('id')
      .eq('word', randomWord)
      .single()

    if (wordDataError) {
      throw wordDataError
    }

    // Set the word of the day for today
    const { data: wotdData, error: wotdError } = await supabaseClient
      .from('word_of_the_day')
      .insert({
        word_id: wordData.id,
        word: randomWord,
        date: today
      })
      .select()
      .single()

    if (wotdError) {
      throw wotdError
    }

    // Also set tomorrow's word of the day to ensure it's ready
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowString = tomorrow.toISOString().split('T')[0]

    // Get a random word for tomorrow
    const { data: tomorrowRandomWord, error: tomorrowWordError } = await supabaseClient
      .rpc('get_random_word_for_day', { difficulty_level: 'easy' })

    if (!tomorrowWordError && tomorrowRandomWord) {
      // Get the word ID for tomorrow's word
      const { data: tomorrowWordData, error: tomorrowWordDataError } = await supabaseClient
        .from('words')
        .select('id')
        .eq('word', tomorrowRandomWord)
        .single()

      if (!tomorrowWordDataError && tomorrowWordData) {
        // Insert tomorrow's word (ignore if it already exists)
        await supabaseClient
          .from('word_of_the_day')
          .upsert({
            word_id: tomorrowWordData.id,
            word: tomorrowRandomWord,
            date: tomorrowString
          }, { onConflict: 'date' })
      }
    }

    console.log(`Successfully set word of the day for ${today}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Word of the day updated for ${today}`,
        date: today,
        word: randomWord,
        wordId: wordData.id
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error updating word of the day:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: error.toString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
