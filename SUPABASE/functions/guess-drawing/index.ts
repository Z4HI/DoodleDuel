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

// Calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length')
  }
  
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  
  // Safety check: if either vector is zero, return 0 (no similarity)
  if (denominator === 0) {
    return 0
  }
  
  return dotProduct / denominator
}

// Estimate word position/rank based on similarity (like Contexto)
// Lower number = closer to target word
function estimatePosition(similarity: number): number {
  if (similarity === 100) {
    return 1 // Perfect match is rank 1
  }
  
  // Exponential decay model: higher similarity = exponentially better position
  // Formula estimates position out of ~50,000 common English words
  // Similarity ranges: 90%+ ≈ positions 1-100, 70-90% ≈ 100-2000, 50-70% ≈ 2000-10000, etc.
  const baseSimilarity = similarity / 100 // Convert to 0-1 scale
  const position = Math.max(1, Math.round(50000 * Math.pow(1 - baseSimilarity, 2.3)))
  
  return position
}

// Get embedding for a text using text-embedding-3-small
async function getEmbedding(text: string, apiKey: string): Promise<{ embedding: number[]; usage: { prompt_tokens: number } }> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.toLowerCase().trim(),
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('OpenAI Embeddings API error:', response.status, errorText)
    throw new Error(`OpenAI Embeddings API error: ${response.status}`)
  }

  const data = await response.json()
  return {
    embedding: data.data[0].embedding,
    usage: data.usage || { prompt_tokens: 0 }
  }
}


serve(async (req: Request) => {
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

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }

    // Step 1: Single Vision Call - Get both guess AND hint in one go
    const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are analyzing a drawing. The player is trying to draw the word "${targetWord}".

Identify what the drawing actually represents and generate a short, witty, comedic hint.

Output ONLY valid JSON: {"guess":"...","hint":"..."}
- "guess": 1 noun (lowercase) that best describes what you see in the drawing
- "hint": SHORT (max 12 words), funny, contextual hint comparing the drawing to the target word "${targetWord}"

Reject text inputs; if input is text, return {"guess":"0","hint":"Invalid input"}.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Identify what this drawing represents and give a short comedic hint about how close it is to the target word "${targetWord}".`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${pngBase64}`,
                  detail: "low"
                }
              }
            ]
          }
        ],
        max_tokens: 80,
        temperature: 0.7
      })
    })

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text()
      console.error('OpenAI Vision API error:', visionResponse.status, errorText)
      throw new Error(`OpenAI Vision API error: ${visionResponse.status}`)
    }

    const visionData = await visionResponse.json()
    const visionContent = visionData.choices[0]?.message?.content

    if (!visionContent) {
      throw new Error('No response from OpenAI Vision')
    }

    // Parse the vision response
    let cleanResponse = visionContent.trim()
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    const parsedVision = JSON.parse(cleanResponse)
    let guess = (parsedVision.guess || 'unknown').toLowerCase().trim()
    let hint = parsedVision.hint || ''

    // Handle invalid input
    if (guess === '0' || guess === '' || hint.includes('Invalid input')) {
      return new Response(
        JSON.stringify({
          success: true,
          guess: 'unknown',
          similarity: 0,
          hint: 'Invalid input - please draw something!',
          targetWord: targetWord,
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Step 2: Check for exact match first (100% similarity)
    const normalizedGuess = guess.toLowerCase().trim().replace(/\s+/g, ' ')
    const normalizedTarget = targetWord.toLowerCase().trim().replace(/\s+/g, ' ')
    
    let similarity: number
    let embeddingTokens = 0
    let guessEmbeddingTokens = 0
    let targetEmbeddingTokens = 0
    
    if (normalizedGuess === normalizedTarget) {
      similarity = 100
      // Override hint for perfect matches
      hint = "Perfect match! You nailed it! 🎯"
    } else {
      // Step 3: Get embeddings for both guess and target word
      const [guessEmbeddingResult, targetEmbeddingResult] = await Promise.all([
        getEmbedding(guess, apiKey),
        getEmbedding(targetWord, apiKey),
      ])

      // Track embedding token usage separately
      guessEmbeddingTokens = guessEmbeddingResult.usage.prompt_tokens || 0
      targetEmbeddingTokens = targetEmbeddingResult.usage.prompt_tokens || 0
      embeddingTokens = guessEmbeddingTokens + targetEmbeddingTokens

      // Step 4: Calculate cosine similarity
      const cosineSim = cosineSimilarity(guessEmbeddingResult.embedding, targetEmbeddingResult.embedding)
      
      // Convert cosine similarity (-1 to 1) to percentage (0 to 100)
      // Cosine similarity for embeddings is typically between 0 and 1 (not negative)
      // Map [0, 1] range to [0, 100]
      similarity = Math.round(cosineSim * 100)
      
      // Clamp to 0-100 range (safety check)
      similarity = Math.max(0, Math.min(100, similarity))
    }

    // Calculate position/rank (like Contexto)
    const position = estimatePosition(similarity)

    // Calculate token usage and costs
    const visionUsage = visionData.usage
    const visionInputTokens = visionUsage?.prompt_tokens || 0
    const visionOutputTokens = visionUsage?.completion_tokens || 0
    
    // GPT-4o-mini pricing: $0.15 per 1M input tokens, $0.60 per 1M output tokens
    // text-embedding-3-small pricing: $0.02 per 1M tokens
    const visionInputCost = (visionInputTokens / 1000000) * 0.15
    const visionOutputCost = (visionOutputTokens / 1000000) * 0.60
    const embeddingCost = (embeddingTokens / 1000000) * 0.02
    
    const totalCost = visionInputCost + visionOutputCost + embeddingCost
    
    // Single line cost log
    console.log(`Input: ${visionInputTokens} tokens ($${visionInputCost.toFixed(6)}) | Output: ${visionOutputTokens} tokens ($${visionOutputCost.toFixed(6)}) | Embeddings: ${embeddingTokens} tokens ($${embeddingCost.toFixed(6)}) | Total: $${totalCost.toFixed(6)}`)

    const finalResponse = {
      success: true,
      guess: guess,
      similarity: similarity,
      position: position,
      hint: hint,
      targetWord: targetWord,
      tokenUsage: {
        vision_prompt_tokens: visionInputTokens,
        vision_completion_tokens: visionOutputTokens,
        embedding_tokens: embeddingTokens,
        total_tokens: visionInputTokens + visionOutputTokens + embeddingTokens,
        vision_input_cost: visionInputCost,
        vision_output_cost: visionOutputCost,
        embedding_cost: embeddingCost,
        total_cost: totalCost
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
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to analyze drawing',
        details: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
