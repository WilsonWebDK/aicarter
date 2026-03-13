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
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: "Firecrawl not configured" }), {
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
    const userId = claimsData.claims.sub;

    // Service role client for DB writes
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { source_id, topic_id } = await req.json();
    if (!source_id || !topic_id) {
      return new Response(JSON.stringify({ error: "source_id and topic_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch source
    const { data: source, error: srcErr } = await admin
      .from("sources")
      .select("*")
      .eq("id", source_id)
      .eq("user_id", userId)
      .single();

    if (srcErr || !source) {
      return new Response(JSON.stringify({ error: "Source not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to processing
    await admin
      .from("sources")
      .update({ processing_status: "processing" })
      .eq("id", source_id);

    let content = "";
    let metadata = source.metadata || {};

    try {
      if (source.type === "pdf" && source.file_path) {
        // Download PDF from storage
        const { data: fileData, error: dlErr } = await admin.storage
          .from("source-files")
          .download(source.file_path);

        if (dlErr || !fileData) {
          throw new Error("Failed to download PDF: " + (dlErr?.message || "unknown"));
        }

        // Extract text from PDF — send as base64 to a simple text extraction
        const text = await fileData.text();
        content = text.substring(0, 50000); // Limit content size
      } else if (source.url) {
        // Scrape URL (works for both regular URLs and YouTube)
        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: source.url,
            formats: ["markdown"],
            onlyMainContent: true,
          }),
        });

        const scrapeData = await scrapeRes.json();

        if (!scrapeRes.ok) {
          throw new Error(
            `Firecrawl error [${scrapeRes.status}]: ${JSON.stringify(scrapeData)}`
          );
        }

        content = scrapeData.data?.markdown || scrapeData.markdown || "";

        // For YouTube, try to extract timestamps from the markdown
        if (source.type === "youtube") {
          const highlights = extractTimestamps(content);
          if (highlights.length > 0) {
            metadata = { ...metadata, highlights };
          }
        }
      }

      // Update source with content
      await admin
        .from("sources")
        .update({
          content: content.substring(0, 100000),
          metadata,
          processing_status: "completed",
        })
        .eq("id", source_id);

      return new Response(
        JSON.stringify({ success: true, content_length: content.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (processErr) {
      console.error("Processing error:", processErr);
      await admin
        .from("sources")
        .update({ processing_status: "failed" })
        .eq("id", source_id);

      return new Response(
        JSON.stringify({
          success: false,
          error: processErr instanceof Error ? processErr.message : "Processing failed",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function extractTimestamps(markdown: string): Array<{ time: number; label: string }> {
  const highlights: Array<{ time: number; label: string }> = [];
  // Match patterns like "0:00", "1:23", "01:23:45", "(1:23)", "[1:23]"
  const regex = /(?:^|\s|\(|\[)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*[-–—]\s*|\s*\)?\s*|\s*\]?\s*)(.{1,80})/gm;
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    const hours = match[3] ? parseInt(match[1]) : 0;
    const minutes = match[3] ? parseInt(match[2]) : parseInt(match[1]);
    const seconds = match[3] ? parseInt(match[3]) : parseInt(match[2]);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    const label = match[4].trim().replace(/[*_#\[\]]/g, "").trim();

    if (label.length > 3 && totalSeconds >= 0) {
      highlights.push({ time: totalSeconds, label });
    }
  }

  return highlights;
}
