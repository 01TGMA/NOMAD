# Scoring Logic

Implemented in `supabase/functions/score-engine/index.ts`. Recomputed on
every new settled transaction (triggered by `monnify-webhook`).

## The three components

All three are scaled to 0–100 against a hardcoded reference value, then
clamped. These reference values are **demo tuning knobs**, not researched
constants — adjust them once you've seen real seed data render, so the
"qualifies for a loan" moment lands where you want it in the live demo.

### Volume (weight: 0.4)

```
volumeComponent = clamp((totalVolume30Days / REFERENCE_VOLUME) * 100, 0, 100)
```
`REFERENCE_VOLUME` defaults to ₦500,000/month — i.e. a trader doing that
much in settled sales over a trailing 30-day window scores 100 on this
axis alone.

### Consistency (weight: 0.35)

Groups transactions by calendar day, then computes the coefficient of
variation (stddev / mean) across daily totals. Lower variation → higher
score:

```
consistencyComponent = clamp((1 - coefficientOfVariation) * 100, 0, 100)
```

This rewards a trader who sells roughly the same amount every day over one
who has a few huge days and many zero days — even at the same total
volume, since steady income is what actually derisks a working-capital
advance.

### Velocity (weight: 0.25)

```
velocityComponent = clamp((transactionCount30Days / REFERENCE_TX_COUNT) * 100, 0, 100)
```
`REFERENCE_TX_COUNT` defaults to 40 transactions/month (~1.3/day). This is
what lets a high-frequency, low-ticket business (okada rider, small
provisions stall) score well even without high nominal volume — this axis
exists specifically so the platform doesn't only reward big-ticket
traders.

## Final score

```
score = volumeComponent * 0.4 + consistencyComponent * 0.35 + velocityComponent * 0.25
```

## Threshold

`disburse-loan` (and both frontend dashboards, independently — see the
tech-debt note below) gate loan eligibility at `score >= 60`.

## Known tech debt

`SCORE_THRESHOLD = 60` currently exists as a duplicated literal in three
places:
- `supabase/functions/disburse-loan/index.ts`
- `trader/trader.js`
- `underwriter/terminal.js`

Before extending this past the hackathon, centralize it — e.g. a shared
config table or a single exported constant fetched at runtime — so a
threshold change doesn't require touching three files.

## What a real version of this would need

This is intentionally a simple, explainable, tunable formula for a 5-day
build and a live demo — not a validated credit model. A production version
would want, at minimum: a labeled dataset of actual repayment outcomes to
fit real weights against (rather than hand-picked ones), a longer history
window than 30 days, seasonality handling for informal-economy income
patterns, and some treatment of transaction size distribution beyond just
mean/variance (e.g. a single huge one-off payment currently helps
`volumeComponent` a lot while barely denting `consistencyComponent`,
which may not be the intended behavior).
