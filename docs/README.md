# Nomad — Credit Infrastructure for Nigeria's Informal Economy

Turns a trader's everyday Monnify transactions into a live, verifiable credit
score they can borrow against.

## Status

- [x] Database schema + RLS (`supabase/migrations/`)
- [x] `monnify-webhook` — ingests settled collections
- [x] `score-engine` — computes live creditworthiness score
- [x] `verify-trader` — Name Enquiry validation of the trader's *own* bank account (disbursement destination)
- [x] `onboard-trader` — creates the Monnify reserved (collection) account
- [x] `list-banks` — bank dropdown data for onboarding
- [x] `disburse-loan` — Monnify Single Transfer disbursement
- [x] Trader PWA dashboard (`trader/`)
- [x] Underwriter terminal dashboard (`underwriter/`)
- [x] Onboarding flow (`onboarding/`)
- [x] Seed data (`supabase/seed.sql`)
- [x] PWA manifest / service worker (`public/`)
- [x] Docs (`docs/`)

## Setup

1. **Supabase**
   Run migrations `0001` through `0004` (SQL Editor or CLI), in order.
   Deploy all six functions:
   ```
   monnify-webhook   score-engine   verify-trader
   onboard-trader    list-banks     disburse-loan
   ```
   Set function secrets:
   ```
   MONNIFY_API_KEY=xxx
   MONNIFY_SECRET_KEY=xxx
   MONNIFY_BASE_URL=https://sandbox.monnify.com
   MONNIFY_SOURCE_ACCOUNT_NUMBER=xxx   # disbursement wallet
   MONNIFY_CONTRACT_CODE=xxx           # needed by onboard-trader
   ```

2. **Frontend config**
   Fill in `shared/supabaseClient.js` with your project URL and anon key.

3. **Monnify sandbox**
   - Email `integration-support@monnify.com` to disable OTP/MFA on your
     sandbox disbursement wallet.
   - Set your webhook URL under **Developers → Webhook URLs** in the
     Monnify dashboard (Transaction Completion field) →
     `https://<project-ref>.supabase.co/functions/v1/monnify-webhook`.
   - See `docs/monnify-integration.md` for details on both.

4. **Seed demo data**
   Run `supabase/seed.sql` via the SQL editor (service role only — it
   inserts into `auth.users` directly).

5. **Onboard a real trader** (optional, alongside/instead of seed data)
   Open `public/index.html` → "Get started as a trader" → walks through
   signup, business details, and bank verification.

6. **Run locally**
   Vanilla JS, no bundler — serve `public/`, `trader/`, `underwriter/`, and
   `onboarding/` with any static file server, e.g. `npx serve .`.

## Repo map

See `docs/schema.md` for the data model — including the important
distinction between a trader's **collection** account (Monnify-generated,
customers pay into it) and their **disbursement** account (their own bank,
loans pay out to it) — and `docs/monnify-integration.md` for the exact
API/webhook shapes each function relies on.