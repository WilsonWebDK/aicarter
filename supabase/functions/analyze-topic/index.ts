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

    // Verify user
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

    // Fetch completed sources
    const { data: sources } = await admin
      .from("sources")
      .select("content, type, title")
      .eq("topic_id", topic_id)
      .eq("user_id", userId)
      .eq("processing_status", "completed");

    if (!sources || sources.length === 0) {
      return new Response(JSON.stringify({ error: "No completed sources" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch topic
    const { data: topic } = await admin
      .from("topics")
      .select("title, description")
      .eq("id", topic_id)
      .single();

    // Fetch user preferences
    const { data: prefs } = await admin
      .from("user_preferences")
      .select("knowledge_level, learning_style, mastery_depth")
      .eq("user_id", userId)
      .single();

    // Aggregate content (limit to ~30k chars for prompt)
    const aggregated = sources
      .map((s) => `### ${s.title || s.type}\n${(s.content || "").substring(0, 10000)}`)
      .join("\n\n---\n\n")
      .substring(0, 30000);

    const systemPrompt = `You are an expert learning analyst. Analyze the provided learning content and generate structured takeaways.

User profile:
- Knowledge level: ${prefs?.knowledge_level || "beginner"}
- Learning style: ${prefs?.learning_style || "visual"}
- Desired mastery depth: ${prefs?.mastery_depth || "conversational"}

Topic: ${topic?.title || "Unknown"}
${topic?.description ? `Description: ${topic.description}` : ""}`;

    const userPrompt = `Analyze this content and generate key takeaways. Also evaluate the mastery percentage (0-100) based on content complexity vs the user's knowledge level.

Content:
${aggregated}`;

    // Call Lovable AI with tool calling for structured output
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
              name: "analyze_content",
              description:
                "Generate key takeaways and calculate mastery percentage for the learning content.",
              parameters: {
                type: "object",
                properties: {
                  takeaways: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        explanation: { type: "string" },
                        importance: {
                          type: "string",
                          enum: ["high", "medium", "low"],
                        },
                      },
                      required: ["title", "explanation", "importance"],
                      additionalProperties: false,
                    },
                  },
                  mastery_percentage: {
                    type: "number",
                    description:
                      "Initial mastery percentage (0-100) based on content complexity vs user knowledge level. Beginner users with complex content get lower scores. Expert users with simple content get higher scores.",
                  },
                },
                required: ["takeaways", "mastery_percentage"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_content" } },
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

      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
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
    const { takeaways, mastery_percentage } = result;

    // Delete old takeaways for this topic
    await admin
      .from("generated_content")
      .delete()
      .eq("topic_id", topic_id)
      .eq("user_id", userId)
      .eq("type", "takeaway");

    // Insert new takeaways
    if (takeaways && takeaways.length > 0) {
      const rows = takeaways.map((t: any) => ({
        topic_id,
        user_id: userId,
        type: "takeaway",
        title: t.title,
        content: { explanation: t.explanation, importance: t.importance },
      }));

      await admin.from("generated_content").insert(rows);
    }

    // Update mastery percentage
    const clampedMastery = Math.max(0, Math.min(100, Math.round(mastery_percentage)));
    await admin
      .from("topics")
      .update({ mastery_percentage: clampedMastery })
      .eq("id", topic_id);

    return new Response(
      JSON.stringify({
        success: true,
        takeaways_count: takeaways?.length || 0,
        mastery_percentage: clampedMastery,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("analyze-topic error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
