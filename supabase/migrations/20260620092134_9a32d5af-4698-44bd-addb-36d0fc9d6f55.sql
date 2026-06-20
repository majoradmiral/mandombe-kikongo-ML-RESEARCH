-- lifetime_unlocks
CREATE TABLE public.lifetime_unlocks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product text NOT NULL,
  stripe_session_id text,
  amount_cents integer,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product)
);
GRANT SELECT ON public.lifetime_unlocks TO authenticated;
GRANT ALL ON public.lifetime_unlocks TO service_role;
ALTER TABLE public.lifetime_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own unlocks" ON public.lifetime_unlocks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- feature_usage
CREATE TABLE public.feature_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature)
);
GRANT SELECT ON public.feature_usage TO authenticated;
GRANT ALL ON public.feature_usage TO service_role;
ALTER TABLE public.feature_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own usage" ON public.feature_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- helper
CREATE OR REPLACE FUNCTION public.has_lifetime_access(_user_id uuid, _product text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lifetime_unlocks
    WHERE user_id = _user_id AND product = _product
  )
$$;