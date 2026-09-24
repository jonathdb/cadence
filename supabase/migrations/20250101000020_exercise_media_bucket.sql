-- Migration: exercise-media Storage bucket + public read policy
-- Design: Components §2b (Supabase Storage bucket). Requirements: 2.4, 2.7, 2.8
--
-- Creates a public Storage bucket that mirrors imported exercise demonstration
-- images (from the one-time free-exercise-db import) so the app owns the assets
-- rather than hot-linking a third party at runtime. exercise_media.storage_path
-- points at objects in this bucket and exercise_media.public_url stores the
-- resolved public URL.
--
-- Access model: public read (anyone can fetch the media for a global exercise);
-- writes are performed by the import path running as service_role only. No
-- public/authenticated insert/update/delete policies are granted here, so the
-- default deny on storage.objects keeps writes restricted to service_role
-- (which bypasses RLS).

-- Public bucket for exercise demonstration media.
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercise-media', 'exercise-media', true)
ON CONFLICT (id) DO NOTHING;

-- Public read: allow SELECT on objects in the exercise-media bucket.
CREATE POLICY "exercise_media_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'exercise-media');
