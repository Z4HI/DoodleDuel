import { serve } from "https://deno.land/std@0.170.0/http/server.ts";

serve(async (req) => {
  try {
    const { pngBase64, word } = await req.json();

    if (!pngBase64 || !word) {
      return new Response(JSON.stringify({ error: "Missing pngBase64 or word" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Log the base64 size for debugging
    console.log("Base64 input length:", pngBase64.length);
    console.log("Estimated image size:", Math.round(pngBase64.length * 0.75), "bytes");

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing OpenAI API key" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Use GPT-4o with extremely critical evaluation
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a HARSH art critic. Score drawings based on how recognizable they are as the target word.

            KEY RULE: If someone saw this drawing without knowing the word, could they guess it's a ${word}?

            SCORING (be VERY strict):
            - 0-10: Completely unrecognizable (random shapes, lines, scribbles)
            - 11-25: Abstract shapes that don't represent the word at all
            - 26-40: Very poor attempt, barely any resemblance
            - 41-60: Poor but has some basic features
            - 61-75: Decent representation
            - 76-90: Good representation
            - 91-100: Excellent representation

            SPECIFIC EXAMPLES:
            - Circle for "dog" = 7 (no resemblance)
            - Circle for "ball" = 72 (good resemblance)
            - Single line for "house" = 12 (no resemblance)
            - Stick figure with 4 legs for "dog" = 48

            Be EXTREMELY critical. A simple circle for most words should score 5-15.
            
            CRITICAL: Give exact scores based on your evaluation. Think carefully about subtle differences and provide precise numerical scores.
            
            SCORING CRITERIA: Evaluate each drawing on multiple dimensions:
            - Line quality (0-25 points): Clean, confident strokes vs shaky, uncertain lines
            - Proportion accuracy (0-25 points): Correct relative sizes and positioning
            - Detail level (0-25 points): Amount of detail and complexity shown
            - Recognition factor (0-25 points): How easily someone could guess the word
            
            Add these scores together for your final score. This will create natural variation.
            
            RESPONSE FORMAT: Respond with ONLY a number between 0-100, followed by a short, creative, comedic comment about the drawing. Be funny and specific to what you see. Examples:
            - "23 - Is this a cat or a potato? The world may never know."
            - "67 - Not bad! I can almost see what you were going for."
            - "91 - Picasso would be proud! This is actually really good."
            
            Keep it short, funny, and specific to the drawing.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Rate this drawing for the word "${word}".

                Question: If I showed this to someone without telling them the word, could they guess it's a ${word}?

                A circle for "dog" should score 5-10%.
                A circle for "ball" should score 60-80%.
                
                Be VERY harsh. Most simple shapes should score under 20%.`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${pngBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 50,
        temperature: 0.9 // High temperature for maximum scoring variation
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return new Response(JSON.stringify({ error: text }), { status: response.status, headers: { "Content-Type": "application/json" } });
    }

    const data = await response.json();
    
    // Log token usage and cost
    const usage = data.usage;
    if (usage) {
      // Calculate cost (GPT-4o pricing as of 2024)
      const inputCostPer1K = 0.0025; // $0.0025 per 1K input tokens (GPT-4o with vision)
      const outputCostPer1K = 0.01;  // $0.01 per 1K output tokens (GPT-4o)
      
      const inputCost = (usage.prompt_tokens / 1000) * inputCostPer1K;
      const outputCost = (usage.completion_tokens / 1000) * outputCostPer1K;
      const totalCost = inputCost + outputCost;
      
      console.log("=== GPT-4o SCORING ===");
      console.log(`Input: ${usage.prompt_tokens} tokens ($${inputCost.toFixed(6)})`);
      console.log(`Output: ${usage.completion_tokens} tokens ($${outputCost.toFixed(6)})`);
      console.log(`Total: $${totalCost.toFixed(6)}`);
      console.log(`Image: ${Math.round(pngBase64.length * 0.75)} bytes`);
      console.log("");
    }
    
    const scoreText = data.choices[0].message.content.trim();
    
    // Extract number and message from response
    const scoreMatch = scoreText.match(/(\d+)/);
    const score = parseInt(scoreMatch?.[1] || "0");
    
    // Extract the comedic comment (everything after the score and dash)
    const messageMatch = scoreText.match(/\d+\s*-\s*(.+)/);
    const responseMessage = messageMatch?.[1]?.trim() || "No comment available";
    
    // Ensure score is between 0-100
    const finalScore = Math.max(0, Math.min(100, score));

    console.log(`Score: ${finalScore} - ${responseMessage}`);

    return new Response(JSON.stringify({ 
      score: finalScore,
      message: responseMessage 
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
