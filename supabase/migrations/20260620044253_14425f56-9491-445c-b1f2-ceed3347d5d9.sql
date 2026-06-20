DROP POLICY IF EXISTS "Anyone can insert page views" ON public.page_views;

CREATE POLICY "Anon can insert anonymous page views"
ON public.page_views
FOR INSERT
TO anon
WITH CHECK (
  page_path IS NOT NULL
  AND length(page_path) <= 2048
  AND length(coalesce(session_id, '')) <= 256
  AND user_id IS NULL
  AND user_email IS NULL
);

CREATE POLICY "Authenticated can insert own page views"
ON public.page_views
FOR INSERT
TO authenticated
WITH CHECK (
  page_path IS NOT NULL
  AND length(page_path) <= 2048
  AND length(coalesce(session_id, '')) <= 256
  AND (user_id IS NULL OR user_id = auth.uid())
  AND (
    user_email IS NULL
    OR user_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);