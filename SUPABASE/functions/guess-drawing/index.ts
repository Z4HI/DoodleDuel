import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  pngBase64: string;
  targetWord: string;
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

    // Get the request body
    const { pngBase64, targetWord }: RequestBody = await req.json()

    if (!pngBase64 || !targetWord) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: pngBase64 and targetWord' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Call OpenAI GPT-4o Vision API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `
Identify 1 noun (lowercase) that best describes the drawing. 
Compare it to the target word using semantic similarity. 
Reject text inputs; if input is text, return {"guess":"0","similarity":0,"hint":"Invalid input"}. 
Output only valid JSON: {"guess":"...","similarity":...,"hint":"..."}, 
where similarity is a percentage (0–100) matching the target word. 
The "hint" should be a short (≤12 words), comedic comment about how close the guess is to the target.
`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Target: "${targetWord}". Identify drawing noun, compare, and give a short comedic hint.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${pngBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 60,
        temperature: 0.25
      })
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('OpenAI API error:', openaiResponse.status, errorText)
      throw new Error(`OpenAI API error: ${openaiResponse.status}`)
    }

    const openaiData = await openaiResponse.json()
    const aiResponse = openaiData.choices[0]?.message?.content

    if (!aiResponse) {
      throw new Error('No response from OpenAI')
    }

    // Parse the AI response (handle markdown code blocks)
    let cleanResponse = aiResponse.trim()
    
    // Remove markdown code blocks if present
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    const parsedResponse = JSON.parse(cleanResponse)
    const guess = parsedResponse.guess || 'unknown'
    let similarity = Math.max(0, Math.min(100, parseInt(parsedResponse.similarity) || 0))
    const hint = parsedResponse.hint || ''

    // Force 100% for exact matches
    const normalizedGuess = guess.toLowerCase().trim().replace(/\s+/g, ' ')
    const normalizedTarget = targetWord.toLowerCase().trim().replace(/\s+/g, ' ')
    
    if (normalizedGuess === normalizedTarget) {
      similarity = 100
    }

    const usage = openaiData.usage
    const inputTokens = usage?.prompt_tokens || 0
    const outputTokens = usage?.completion_tokens || 0
    
    // GPT-4o pricing: $5.00 per 1M input tokens, $15.00 per 1M output tokens
    const inputCost = (inputTokens / 1000000) * 5.00
    const outputCost = (outputTokens / 1000000) * 15.00
    
    console.log(`Input tokens: ${inputTokens} ($${inputCost.toFixed(4)}) | Output tokens: ${outputTokens} ($${outputCost.toFixed(4)})`)

    const finalResponse = {
      success: true,
      guess: guess,
      similarity: similarity,
      hint: hint,
      targetWord: targetWord,
      tokenUsage: {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        input_cost: inputCost,
        output_cost: outputCost,
        total_cost: inputCost + outputCost
      }
    }

    return new Response(
      JSON.stringify(finalResponse),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in guess-drawing function:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to analyze drawing',
        details: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
