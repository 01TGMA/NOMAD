# Demo Script

Target: the "watch it happen live" climax described in the original pitch —
judges scan a QR, pay into sandbox, watch the score update in under 2
seconds, then watch a loan disburse instantly.

## Before you go on stage

- [ ] Confirm Monnify has disabled MFA/OTP on your sandbox disbursement
      wallet (see `monnify-integration.md` — this is the single biggest
      risk to the demo working headlessly).
- [ ] Run `supabase/seed.sql` fresh so the ledger has a realistic spread
      (some qualified traders, some not).
- [ ] Confirm `payload.eventType` and `eventData` field names in
      `monnify-webhook` actually match what your sandbox sends — test with
      one real manual transfer before the demo, not for the first time on
      stage.
- [ ] Open both dashboards in separate tabs/windows so judges can see
      trader + underwriter side by side, or project one and narrate the
      other.
- [ ] Pick a specific seeded trader with a score close to but under the
      60-point threshold (Chukwuemeka Auto Repairs at 67 is already over —
      consider seeding one more trader at ~55 specifically so a single live
      payment visibly pushes them over the line on stage).

## The narrative arc

**1. Set up the problem (30 sec)**
Millions of Nigerians in the informal economy move real money daily but
have no formal transaction history a bank will lend against.

**2. Show the trader dashboard (30 sec)**
Open a seeded trader who's close to qualifying. Point at the gauge — needle
sitting just below the redline. Point at the receipt feed — real settled
transactions, not self-reported numbers.

**3. Live payment (the climax, ~90 sec)**
- Show the QR code / account number on screen.
- Have a judge (or a phone in your hand) pay into that sandbox account via
  a Monnify test transfer.
- Narrate what's happening underneath while everyone watches the screen:
  webhook fires → transaction lands in the receipt feed → score-engine
  recalculates → gauge needle sweeps across the redline in real time.
- This should visibly happen in under 2 seconds if the webhook path is
  working correctly — if it's slower than that in rehearsal, that's a
  signal to debug before demo day, not to explain away live.

**4. Switch to the underwriter terminal (30 sec)**
Same trader now shows "QUALIFIED" in the ledger. Open their panel — score
breakdown, the exact volume/consistency/velocity numbers that got them
there.

**5. Disburse, live (30 sec)**
Hit disburse. Narrate: this is a real Monnify Single Transfer API call,
not a mocked animation. If MFA is properly disabled, this completes
immediately — say so, since it's a real technical accomplishment judges may
not call out on their own.

**6. Close (15 sec)**
Collections generate the evidence layer. Disbursements close the loop.
Both are Monnify's actual core product, not decoration — that's the whole
pitch.

## If something breaks on stage

- **Webhook doesn't fire / score doesn't update**: fall back to narrating
  the seeded data as "this is what it looks like once the same flow has
  been running for a trader over 30 days," and manually trigger
  `score-engine` via a direct function invocation to show the mechanism,
  rather than silently retrying the live moment.
- **Disbursement returns `PENDING_AUTHORIZATION`**: acknowledge it plainly
  — "MFA needs backend approval right now, here's what that response looks
  like" — rather than pretending it succeeded. Judges will respect an
  honest, informed response over a hidden failure.
- **Have a recorded backup clip** of one successful full run-through from
  rehearsal, in case live network conditions fail you in the room.
