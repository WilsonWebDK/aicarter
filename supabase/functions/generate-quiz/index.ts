import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { topic_id, focus_areas } = await req.json();

    if (!topic_id) {
      return new Response(JSON.stringify({ error: "topic_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch completed sources
    const { data: sources } = await admin
      .from("sources")
      .select("content, type, title")
      .eq("topic_id", topic_id)
      .eq("user_id", userId)
      .eq("processing_status", "completed");

    if (!sources || sources.length === 0) {
      return new Response(JSON.stringify({ error: "No completed sources to generate quiz from" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch topic & prefs
    const [topicRes, prefsRes] = await Promise.all([
      admin.from("topics").select("title, description").eq("id", topic_id).single(),
      admin.from("user_preferences").select("knowledge_level, learning_style, mastery_depth").eq("user_id", userId).single(),
    ]);

    const topic = topicRes.data;
    const prefs = prefsRes.data;

    const aggregated = sources
      .map((s) => `### ${s.title || s.type}\n${(s.content || "").substring(0, 10000)}`)
      .join("\n\n---\n\n")
      .substring(0, 30000);

    const focusInstruction = focus_areas?.length
      ? `\n\nFOCUS on these weak areas from the previous quiz: ${focus_areas.join(", ")}. Challenge the user from a different angle on these topics.`
      : "";

    const systemPrompt = `You are an expert quiz creator for learning. Generate challenging but fair questions that test understanding, not just memorization. Include practical real-world examples and scenarios.

User profile:
- Knowledge level: ${prefs?.knowledge_level || "beginner"}
- Learning style: ${prefs?.learning_style || "visual"}
- Mastery depth: ${prefs?.mastery_depth || "conversational"}

Topic: ${topic?.title || "Unknown"}
${topic?.description ? `Description: ${topic.description}` : ""}`;

    const userPrompt = `Generate 7 quiz questions from this content. Questions should test conceptual understanding and include practical examples. Each wrong answer explanation should teach the user why the correct answer is right.${focusInstruction}

Content:
${aggregated}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_quiz",
              description: "Generate quiz questions with multiple choice answers, explanations, and practical examples.",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string", description: "The quiz question" },
                        options: {
                          type: "array",
                          items: { type: "string" },
                          description: "Exactly 4 answer options",
                        },
                        correct_index: { type: "number", description: "Index (0-3) of the correct answer" },
                        explanation: { type: "string", description: "Why the correct answer is right — clear reasoning" },
                        practical_example: { type: "string", description: "A real-world example that reinforces this concept" },
                      },
                      required: ["question", "options", "correct_index", "explanation", "practical_example"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["questions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_quiz" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);

      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ error: "Quiz generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI returned no structured output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);

    // Store quiz in generated_content
    await admin.from("generated_content").insert({
      topic_id,
      user_id: userId,
      type: "quiz",
      title: `Quiz — ${topic?.title || "Topic"}`,
      content: result,
    });

    return new Response(
      JSON.stringify({ success: true, quiz: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-quiz error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
