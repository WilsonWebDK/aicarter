

# Deletion Suite, Learning Path, Synthesis UX, and Mobile Audit

## 1. Database: Cascading Deletes
Run a migration to add `ON DELETE CASCADE` foreign keys from `sources`, `generated_content` to `topics`. Currently these columns reference `topic_id` but have no FK constraint — add them so deleting a topic auto-removes all associated data.

```sql
ALTER TABLE sources ADD CONSTRAINT fk_sources_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE;
ALTER TABLE generated_content ADD CONSTRAINT fk_generated_content_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE;
```

## 2. Delete Topic (Dashboard + TopicDetail)
- **Dashboard.tsx**: Add a delete button (Trash icon) on each topic card. On click, show an AlertDialog confirmation, then `supabase.from("topics").delete().eq("id", topic.id)`. Also delete associated files from `source-files` bucket.
- **TopicDetail.tsx**: Add a "Delete Topic" button in the header area with the same confirmation flow. Navigate back to `/knowledge` after deletion.

## 3. Delete Source (TopicDetail)
- Add a small trash/X button on each source card in TopicDetail.
- On confirm, delete the source row. If it has a `file_path`, also remove the file from `source-files` storage.

## 4. PDF Processing Fix
The signed URL logic in `process-source/index.ts` already exists (lines 84-115). Change expiration from 3600 to 300 (5 minutes) as requested. This is a minor edit.

## 5. Model Upgrade to Gemini 3.1 Pro
- `analyze-topic/index.ts` line 117: already uses `google/gemini-3.1-pro-preview` — no change needed.
- `generate-quiz/index.ts` line 113: change from `google/gemini-3-flash-preview` to `google/gemini-3.1-pro-preview`.

## 6. Mobile Layout Audit
In `KnowledgeBank.tsx`, `Learn.tsx`, `TopicDetail.tsx`:
- Ensure all containers use `w-full max-w-2xl mx-auto` with no fixed widths.
- All flex-row layouts get `flex-wrap` or switch to `flex-col` on mobile.
- Source type selector buttons: use `flex-wrap` so they stack on very narrow screens.
- YouTube embed: use `w-full aspect-video` (already done).

## 7. Progressive Loading Messages
Update `PROCESSING_MESSAGES` in `TopicDetail.tsx` to the new set:
```
"Extracting Golden Moments", "Linking PDF Insights", "Building your roadmap", "Finalizing Synthesis"
```

## 8. New Edge Function: `generate-learning-path`
Replace the quiz-first approach in Learn.tsx with a "Learning Path" (roadmap).

**Edge function** using `google/gemini-3.1-pro-preview` with tool calling:
- Input: `topic_id`
- Fetches all completed sources (with titles, types, content) + user preferences
- Generates 5-8 atomic steps, each containing:
  - `title`: step name
  - `explanation`: core concept via analogy (mentor tone)
  - `actionable_insight`: a practical "Try this" or "Remember this" tip
  - `source_citation`: reference like `[Video 1, 04:20]` or `[PDF Page 3]`
  - `check_question`: single question text
  - `check_options`: 4 options
  - `check_correct_index`: 0-3
  - `check_explanation`: why the answer is correct
- Store in `generated_content` with `type: "learning_path"`

## 9. Learn.tsx Rebuild — Learning Path UI
Replace the current quiz-first view with a vertical roadmap:

- **Milestone Map** header: "Step X of Y: {step.title}" — replaces percentage bar
- **Vertical path** of step cards, connected by a dotted line
- Each step card:
  - Locked state (opacity-50 + lock icon) until previous step's check is answered correctly
  - Expanded state showing: explanation, actionable insight, source citation badge (clickable), and the Socratic check question
  - On correct answer: step marked complete with checkmark, next step unlocks
  - On wrong: show explanation, let them retry
- Keep the "Key Moments" section for YouTube sources below the path
- Keep the existing quiz as an option ("Take Full Quiz" button at the bottom after completing the path)

## 10. Synthesis Card (TopicDetail)
Replace the current success card text. After all sources finish processing, show:
- Count of sources by type (X videos, Y docs)
- "I've analyzed X videos and Y documents. I found Z key themes. Ready to master them?"
- "Start Learning" CTA button

To get the theme count, the analyze-topic function will return a `theme_count` in its response. Update the analyze-topic function's tool schema to include `theme_count: number`.

## 11. Tone & Takeaway Refactoring
Update the `analyze-topic` system prompt to instruct Gemini to:
- Use a "Mentor" tone — encouraging, clear, simple analogies
- Generate actionable takeaways: "Apply X when you need to achieve Y" format instead of "X is Y"
- Add `actionable_tip` field to each takeaway in the tool schema

## Files to Create/Modify

| File | Changes |
|------|---------|
| Migration SQL | Add FK cascades on sources + generated_content |
| `supabase/functions/process-source/index.ts` | Change signed URL expiry to 300s |
| `supabase/functions/analyze-topic/index.ts` | Update prompt tone, add `theme_count` + `actionable_tip` to schema |
| `supabase/functions/generate-quiz/index.ts` | Change model to `gemini-3.1-pro-preview` |
| `supabase/functions/generate-learning-path/index.ts` | New: learning path generation |
| `src/pages/Dashboard.tsx` | Add delete topic with AlertDialog |
| `src/pages/TopicDetail.tsx` | Delete topic/source, new processing messages, synthesis card, mobile fixes |
| `src/pages/KnowledgeBank.tsx` | Mobile layout audit |
| `src/pages/Learn.tsx` | Full rebuild: learning path roadmap with mastery lock, milestone map |

