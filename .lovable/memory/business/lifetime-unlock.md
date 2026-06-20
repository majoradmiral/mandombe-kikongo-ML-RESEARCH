---
name: Lifetime Translator + Dictionary unlock
description: $19.99 one-time purchase model with 11-use free quota for Translator and Dictionary
type: feature
---
- Price: $19.99 one-time, Stripe price ID `price_1TkL5bBd8z1DEMAaxwrxzWsv`, product `prod_Ujoj6YV3KmWkXm`.
- Free quota: 11 uses shared between Translator (each translation) and Dictionary (each debounced search query ≥2 chars, dedup per query).
- Counter feature key: `translator_dictionary`. Tables: `feature_usage` (counter), `lifetime_unlocks` (purchases).
- Bypass: admins, active Premium subscribers, lifetime unlock holders → unlimited (`hasUnlimitedAccess` in `_shared/quota.ts`).
- Edge functions: `create-lifetime-checkout`, `verify-lifetime-purchase` (called on Stripe return), `record-feature-usage` (Dictionary), `translate-lari` (Translator — increments after auth check).
- Server returns HTTP 402 with `{error:"quota_exceeded"}` when over the limit.
- `check-subscription` returns `hasLifetimeTranslator`, `translatorUsesRemaining`, `translatorUsesLimit` (11).
- Premium subscription ($9.99/mo) untouched — still unlocks everything site-wide; lifetime is the narrower product for Translator+Dictionary only.
