## Goal

Introduce a one-time **$19.99 lifetime unlock** that gives signed-in users unlimited access to the **Translator** and **Dictionary**. Non-buyers get **11 free uses total** (lifetime, per account). The existing $9.99/month Premium subscription stays unchanged and continues to unlock everything (lessons, stories, Kilolaka, Mbuta Matondo, etc.).

## Why $19.99

- ~2 months of Premium → feels fair for *forever* access to a narrow toolset.
- High enough to not cannibalize the subscription (which still wins on breadth).
- Sweet spot for niche language/diaspora tools — low enough for impulse purchase after hitting the 11-use wall, high enough to be meaningful revenue per user.
- Admins and active Premium subscribers automatically have access (no double-charging).

## User-facing behavior

- **Translator page & Dictionary page**: each call increments a counter on the user's account. A small "X / 11 free uses remaining" indicator appears below the input.
- **At 0 remaining**: input is disabled, replaced by a paywall card:
  > "You've used your 11 free translations. Unlock the Translator + Dictionary forever for $19.99 — or get everything with Premium ($9.99/mo)."
  Two buttons: **Buy lifetime access — $19.99** and **Go Premium — $9.99/mo**.
- **Not signed in**: redirected to /auth before the first use is counted (prevents anonymous abuse / quota reset by clearing cookies).
- **After purchase**: paywall disappears, counter hidden, unlimited use.
- **Premium subscribers / admins**: never see the counter or paywall.

## Technical design

### Database (one migration)

```text
table public.lifetime_unlocks
  user_id uuid PK references auth.users on delete cascade
  product text not null         -- 'translator_dictionary'
  stripe_session_id text
  amount_cents int
  purchased_at timestamptz default now()

table public.feature_usage
  user_id uuid
  feature text                  -- 'translator' | 'dictionary'
  count int default 0
  updated_at timestamptz
  PK (user_id, feature)
```

- GRANTs: `authenticated` SELECT own rows; `service_role` ALL. Writes happen only via edge functions (service role).
- RLS: users can read their own rows; no client-side INSERT/UPDATE.
- New SQL helper `public.has_lifetime_access(_user_id uuid, _product text) returns boolean` (SECURITY DEFINER).

### Edge functions

- **`create-lifetime-checkout`** — new. Creates a Stripe Checkout session in `mode: "payment"` for a new $19.99 one-time price (created via the Stripe tool). Success URL refreshes entitlements.
- **`verify-lifetime-purchase`** — new. Called on success-URL return; reads the Checkout session, on `payment_status === "paid"` upserts into `lifetime_unlocks`.
- **`check-subscription`** — extended to also return `lifetimeTranslator: boolean` so the frontend can gate in one round-trip.
- **`translate-lari`**, **`translate-batch`**, and the dictionary lookup path — wrapped with a quota check helper:
  1. If admin / premium / lifetime → allow, no increment.
  2. Else read `feature_usage.count`; if ≥ 11 → return `403 { error: "quota_exceeded" }`.
  3. Else atomically increment and proceed.
  - Counter is incremented **server-side only**, so it can't be tampered with from the browser.

### Frontend

- **`AuthContext`** — add `hasLifetimeTranslator: boolean` and `translatorUsesRemaining: number | null`, populated by `check-subscription`.
- **New component `TranslatorQuotaGate`** — wraps the translator input area. Shows remaining count, swaps to paywall card at 0, handles the two CTAs (lifetime checkout vs. monthly Premium).
- **`Translator.tsx`** and **`Dictionary.tsx`** — wrap the interactive area with `TranslatorQuotaGate`. The 403 from edge functions also triggers the paywall (defense in depth).
- **`PremiumSection.tsx`** — add a second card next to the monthly plan: "Lifetime Translator + Dictionary — $19.99 one-time".

### Stripe

- Create one new product **"Lifetime Translator + Dictionary"** with a one-time $19.99 USD price via `stripe--create_stripe_product_and_price`. Hard-code the resulting `price_…` ID in `create-lifetime-checkout`.
- Existing $9.99/mo subscription product is untouched.

## Out of scope (explicit)

- No webhook handler — verification happens on success-URL return, matching the existing `check-subscription` pattern.
- Mbuta Matondo, lessons, stories, Kilolaka remain Premium-only.
- No refund flow / no "transfer lifetime to another account" flow.
- Existing 11 free uses are granted to all current users (no retroactive deduction based on past usage).

## Risk notes

- Quota is per-account, so users can create multiple emails to reset. Acceptable for v1; can add device fingerprinting later if abuse appears.
- If the user is also a Premium subscriber and later cancels, lifetime entitlement (if purchased) persists; if not purchased, they fall back to the 11-use quota (already exhausted counter stays exhausted).
