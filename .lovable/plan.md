

# Carter — AI Learning Platform (Phase 1)

## Overview
Build the foundation of Carter: a mobile-first AI learning platform with authentication, an interactive onboarding quiz, a card-based dashboard, and a multi-source knowledge ingestion system.

## 1. Authentication
- Email/password signup & login pages with the Carter brand (#FF2B2B accents, large rounded corners)
- Password reset flow with `/reset-password` page
- Protected routes — redirect unauthenticated users to login

## 2. Onboarding Personalization Quiz
After first signup, guide users through a multi-step interactive quiz:
- **Learning style**: Visual, Auditory, Conversational (card selection)
- **Available time**: Slider for minutes per day
- **Knowledge level**: Beginner → Expert scale
- **Desired mastery depth**: Conversational / Professional / Expert

Store preferences in a `user_preferences` table linked to auth. Show a progress bar and one question per screen for a focused, mobile-friendly feel.

## 3. Main Dashboard
- **Mobile**: Bottom navigation bar (Home, Knowledge Bank, Learn, Profile)
- **Desktop**: Sidebar navigation
- Card-based layout with glassmorphism effects, 24px+ border radius
- Dashboard shows: active topics with mastery percentage, recent activity, quick-add button
- Empty state prompts users to create their first topic

## 4. Knowledge Bank & Multi-Source Ingestion
- **Topic creation**: Name a topic, then add sources to it
- **Source types supported**:
  - **PDF upload** — Upload via Supabase Storage, extract text
  - **YouTube URL** — Paste link, extract transcript, identify key segments ("Golden Segments" highlight feed)
  - **Web URL** — Scrape content via Firecrawl connector
- Each source displays as a card showing title, type icon, and processing status
- **YouTube highlight feed**: Cards showing key moments; clicking jumps to timestamp in embedded player

## 5. AI Synthesis (Lovable AI)
- When sources are added, use Lovable AI to generate:
  - A topic summary
  - Key takeaways (displayed as swipeable cards)
  - Quiz questions for the topic
- Store generated content linked to the topic

## 6. Database Structure
- `profiles` table (user profile data)
- `user_preferences` table (quiz answers, learning style)
- `topics` table (user's learning topics, mastery %)
- `sources` table (linked to topics — type, URL, content, status)
- `generated_content` table (AI outputs: summaries, quizzes, takeaways)
- `user_roles` table (for admin access, following security pattern)
- Subscription-ready fields (hidden for now)

## 7. Design System
- Primary: `#FF2B2B` for CTAs, progress bars, active states
- Background: White / light gray (`#F5F5F7`)
- Cards: Soft glassmorphism with `backdrop-blur`, subtle shadows, 24px border radius
- Typography: Clean sans-serif, generous spacing
- Learning mode: Minimalist single-element focus view

## 8. Freemium Logic
- First topic is free for all users
- Additional topics show a "Premium required" lock (admin manually toggles premium via a simple admin panel)

