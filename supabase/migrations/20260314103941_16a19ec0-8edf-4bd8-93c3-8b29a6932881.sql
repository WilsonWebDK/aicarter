
-- Add cascading delete foreign keys so deleting a topic removes all associated data
ALTER TABLE public.sources
  ADD CONSTRAINT fk_sources_topic
  FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;

ALTER TABLE public.generated_content
  ADD CONSTRAINT fk_generated_content_topic
  FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;
