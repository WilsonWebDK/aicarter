

# Content Processing Pipeline & UI Updates

## Overview
Build the backend processing pipeline for source content (Firecrawl scraping + Lovable AI analysis), add real-time UI updates, YouTube highlight cards, and "Coming Soon" badges for Phase 2 features.

## 1. Connect Firecrawl
Link the existing Firecrawl connection (`std_01kkm1zfg3fvhrp31qp026yc9v`) to the project so the API key is available in edge functions.

## 2. Edge Function: `process-source`
Single edge function called from the frontend after a source is inserted. Receives `source_id` and `topic_id`.

**Flow:**
1. Fetch the source row using service role client
2. Based on `type`:
   - **url**: Call Firecrawl `/v1/scrape` with `formats: ['markdown']` to get clean text
   - **youtube**: Call Firecrawl `/v1/scrape` on the YouTube URL with `formats: ['markdown']` — extracts transcript text. Store any detected timestamps in `metadata.highlights[]`
   - **pdf**: Download file from `source-files` bucket, extract text (send raw text to Firecrawl scrape or use basic text extraction)
3. Update `sources` row: set `content` to extracted text, `processing_status` to `completed` (or `failed`)
4. Return the result

**Config:** `verify_jwt = false` (validate auth in code). CORS headers included.

## 3. Edge Function: `analyze-topic`
Called after source processing completes. Uses Lovable AI (`google/gemini-3.1-pro-preview`) via the gateway.

**Flow:**
1. Fetch all completed sources for the topic
2. Fetch user's `user_preferences` (learning style, knowledge level, mastery depth)
3. Send aggregated content + user profile to Gemini with a structured tool call:
   - Generate 5-10 key takeaways (title + explanation + importance)
   - Calculate initial mastery percentage (0-100) based on content complexity vs user level
4. Insert takeaways into `generated_content` table (type: `takeaway`)
5. Update `topics.mastery_percentage`

**Config:** `verify_jwt = false`. Uses `LOVABLE_API_KEY`.

## 4. Frontend: Trigger Processing
In `TopicDetail.tsx`, after successfully inserting a source, call `supabase.functions.invoke('process-source', { body: { source_id, topic_id } })`. On completion, call `analyze-topic`.

## 5. Real-time Source Status Updates
- Enable realtime on `sources` table (migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.sources`)
- In `TopicDetail.tsx`, subscribe to `postgres_changes` on `sources` filtered by `topic_id` — update source cards' status icons live as processing completes

## 6. YouTube Highlight Feed
In `TopicDetail.tsx`, for YouTube sources with `metadata.highlights`:
- Render clickable timestamp cards below the source
- Each card shows the timestamp + a snippet of the transcript at that point
- Clicking opens/seeks an embedded YouTube iframe player to that timestamp using `?start=` parameter

## 7. "Coming Soon" Badges
In `TopicDetail.tsx` and `Dashboard.tsx`:
- Add two glass-card sections: "AI Podcast" (with headphone icon) and "Voice Agent" (with mic icon)
- Each gets a "Coming Soon" badge (small pill using the Badge component with `variant="secondary"`)
- Subtle opacity overlay (opacity-60) to indicate non-functional
- No click handlers — purely visual placeholders

## 8. Database Migration
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.sources;`

## 9. Config Updates
Add to `supabase/config.toml`:
```toml
[functions.process-source]
verify_jwt = false

[functions.analyze-topic]
verify_jwt = false
```

## Technical Details

**Edge function auth pattern:** Both functions validate the JWT from the Authorization header using `supabase.auth.getUser()` before proceeding. Service role client used for DB writes to bypass RLS.

**Firecrawl call pattern:**
```
POST https://api.firecrawl.dev/v1/scrape
Authorization: Bearer ${FIRECRAWL_API_KEY}
Body: { url, formats: ['markdown'], onlyMainContent: true }
```

**AI call pattern:**
```
POST https://ai.gateway.lovable.dev/v1/chat/completions
Authorization: Bearer ${LOVABLE_API_KEY}
Body: { model: 'google/gemini-3.1-pro-preview', messages, tools, tool_choice }
```

**Files created/modified:**
- `supabase/functions/process-source/index.ts` (new)
- `supabase/functions/analyze-topic/index.ts` (new)
- `supabase/config.toml` (add function configs)
- `src/pages/TopicDetail.tsx` (invoke functions, realtime subscription, YouTube highlights, Coming Soon sections)
- `src/pages/Dashboard.tsx` (Coming Soon cards)
- Migration SQL for realtime publication

