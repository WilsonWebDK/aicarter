

# Learn Experience, Quiz Engine, and UX Polish

## Overview
Shift focus from ingestion to learning. Fix PDF processing, add animated processing UX, build the Learn page with takeaways/highlights/quiz, and remove mastery percentage bars.

## 1. Fix PDF Processing (Edge Function)
In `supabase/functions/process-source/index.ts`, replace the current PDF handling (which tries `fileData.text()`) with:
- Generate a signed URL via `admin.storage.from("source-files").createSignedUrl(source.file_path, 3600)`
- Pass that signed URL to Firecrawl's `/v1/scrape` endpoint with `formats: ['markdown']`
- This gives Firecrawl access to read the PDF and extract markdown content

## 2. Processing UX in TopicDetail
Replace the spinner status icon with an animated loading bar and rotating status messages:
- Messages cycle through: "Crunching data...", "Extracting numbers...", "Understanding content...", "Analyzing structures...", "Preparing your quiz..."
- Use a `useEffect` interval to rotate every 2.5 seconds
- After all sources finish processing, show a success confirmation card: "Sources received! AI is now building your Learn universe for **{topic.title}**. You are ready to master this content." with a "Start Learning" button linking to `/learn?topic={id}`

## 3. Remove Mastery Percentage Bars
Remove from:
- `TopicDetail.tsx` — remove `<Progress>` bar and percentage text in the topic header
- `Dashboard.tsx` — remove percentage display and `<Progress>` in topic cards, remove "Avg Mastery" stat card
- `KnowledgeBank.tsx` — remove `{topic.mastery_percentage}% mastery` text from topic cards

## 4. Learn Page Rebuild (`Learn.tsx`)
Route: `/learn?topic={topicId}` — if no topic param, show a topic selector listing user's topics.

When a topic is selected:
- **Topic header** with title
- **Key Moments** section (moved from TopicDetail): YouTube highlights with embedded player and clickable timestamp cards
- **Key Takeaways** section (moved from TopicDetail): AI-generated takeaway cards with importance badges
- **Start Quiz** button that opens the fullscreen quiz

## 5. Quiz Edge Function (`generate-quiz`)
New edge function using `google/gemini-3.1-pro-preview`:
- Receives `topic_id` and optional `focus_areas` (weakness topics from previous quiz)
- Fetches all completed sources content + user preferences
- Uses tool calling to generate 5-10 questions with structure:
  ```
  { question, options: string[4], correct_index, explanation, practical_example }
  ```
- Store quiz in `generated_content` table with `type: "quiz"`

## 6. Quiz UI (within Learn.tsx)
Fullscreen overlay with clean, minimalist design:
- One question at a time, large card, smooth `framer-motion` transitions
- 4 answer options as tappable cards
- On answer:
  - **Correct**: Green highlight, "Correct! You have a solid grasp of this concept." message
  - **Wrong**: Red highlight on selected, green on correct, explanation card: "Actually, it's **{correct}** because {logic}. Here is a practical example: {example}."
- Auto-advance after 2s (or tap to continue)
- **Results screen**: Score, list of questions with correct/wrong indicators, strength/weakness breakdown
- "Generate New Quiz" button that sends `focus_areas` from wrong answers back to the edge function

## 7. Navigation Updates
- Dashboard "Start Learning" button → `/learn` (add a prominent CTA card if topics exist)
- App route: add `/learn` route (already exists)
- Learn page with `?topic=` query param support

## 8. Database Changes
None required — `generated_content` table already supports `type: "quiz"` rows.

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/process-source/index.ts` | Fix PDF: signed URL → Firecrawl |
| `supabase/functions/generate-quiz/index.ts` | New: quiz generation via Gemini |
| `src/pages/Learn.tsx` | Rebuild: topic selector, takeaways, highlights, quiz UI |
| `src/pages/TopicDetail.tsx` | Remove mastery bar, move highlights/takeaways out, add processing animation + success card |
| `src/pages/Dashboard.tsx` | Remove mastery bars/stats, add "Start Learning" CTA |
| `src/pages/KnowledgeBank.tsx` | Remove mastery percentage from topic cards |

