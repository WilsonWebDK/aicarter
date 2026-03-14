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
    const { topic_id } = await req.json();

    if (!topic_id) {
      return new Response(JSON.stringify({ error: "topic_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch completed sources with titles for citation
    const { data: sources } = await admin
      .from("sources")
      .select("content, type, title, url")
      .eq("topic_id", topic_id)
      .eq("user_id", userId)
      .eq("processing_status", "completed");

    if (!sources || sources.length === 0) {
      return new Response(JSON.stringify({ error: "No completed sources" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [topicRes, prefsRes] = await Promise.all([
      admin.from("topics").select("title, description").eq("id", topic_id).single(),
      admin.from("user_preferences").select("knowledge_level, learning_style, mastery_depth").eq("user_id", userId).single(),
    ]);

    const topic = topicRes.data;
    const prefs = prefsRes.data;

    // Build source list with labels for citation
    const sourceLabels = sources.map((s, i) => {
      const label = s.type === "youtube" ? `Video ${i + 1}` : s.type === "pdf" ? `PDF ${i + 1}` : `Article ${i + 1}`;
      return { label, title: s.title || label, type: s.type };
    });

    const aggregated = sources
      .map((s, i) => `### [${sourceLabels[i].label}] ${s.title || s.type}\n${(s.content || "").substring(0, 10000)}`)
      .join("\n\n---\n\n")
      .substring(0, 30000);

    const systemPrompt = `You are a brilliant mentor who breaks complex topics into small, digestible learning steps. You explain ideas through simple analogies, give practical "try this" tips, and always cite which source the knowledge comes from. Your tone is warm, encouraging, and clear — like a smart friend who genuinely wants you to succeed.

Available sources for citation: ${sourceLabels.map((s) => s.label).join(", ")}

User profile:
- Knowledge level: ${prefs?.knowledge_level || "beginner"}
- Learning style: ${prefs?.learning_style || "visual"}
- Mastery depth: ${prefs?.mastery_depth || "conversational"}

Topic: ${topic?.title || "Unknown"}
${topic?.description ? `Description: ${topic.description}` : ""}`;

    const userPrompt = `Break this content into 5-8 atomic learning steps. Each step should build on the previous one, progressing from foundational concepts to more advanced ideas. Use analogies to explain concepts. Include a single Socratic question per step to confirm understanding.

Content:
${aggregated}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-pro-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_learning_path",
              description: "Generate a step-by-step learning path with Socratic checks.",
              parameters: {
                type: "object",
                properties: {
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Short step name" },
                        explanation: { type: "string", description: "Core concept explained via a simple analogy. 2-3 sentences max." },
                        actionable_insight: { type: "string", description: "A practical 'Try this' or 'Remember this' tip." },
                        source_citation: { type: "string", description: "Reference like [Video 1, 04:20] or [PDF 1, Page 3]" },
                        check_question: { type: "string", description: "Single Socratic question to confirm understanding." },
                        check_options: {
                          type: "array",
                          items: { type: "string" },
                          description: "Exactly 4 answer options.",
                        },
                        check_correct_index: { type: "number", description: "Index 0-3 of the correct answer." },
                        check_explanation: { type: "string", description: "Why the correct answer is right." },
                      },
                      required: ["title", "explanation", "actionable_insight", "source_citation", "check_question", "check_options", "check_correct_index", "check_explanation"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["steps"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_learning_path" } },
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

      return new Response(JSON.stringify({ error: "Learning path generation failed" }), {
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

    // Delete old learning path for this topic
    await admin
      .from("generated_content")
      .delete()
      .eq("topic_id", topic_id)
      .eq("user_id", userId)
      .eq("type", "learning_path");

    // Store new learning path
    await admin.from("generated_content").insert({
      topic_id,
      user_id: userId,
      type: "learning_path",
      title: `Learning Path — ${topic?.title || "Topic"}`,
      content: result,
    });

    return new Response(
      JSON.stringify({ success: true, steps_count: result.steps?.length || 0, learning_path: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-learning-path error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
