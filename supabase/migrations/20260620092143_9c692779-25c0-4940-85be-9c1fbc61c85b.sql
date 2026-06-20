REVOKE EXECUTE ON FUNCTION public.has_lifetime_access(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_lifetime_access(uuid, text) TO service_role;