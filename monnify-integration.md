# Monnify Integration Notes

Everything here has been checked against developers.monnify.com; anything
still unverified against a real sandbox call is flagged explicitly.

## Base URLs

- Sandbox: `https://sandbox.monnify.com`
- Live: `https://api.monnify.com` (per the BVN-match endpoint docs — double
  check this matches your dashboard before going live, since some Monnify
  docs are inconsistent about live vs sandbox hostnames)

## Authentication

All endpoints (except Name Enquiry, which is free/public-ish) require a
Bearer token:

```
POST {base}/api/v1/auth/login
Authorization: Basic base64(apiKey:secretKey)

→ { "requestSuccessful": true, "responseBody": { "accessToken": "...", "expiresIn": ... } }
```

Use `responseBody.accessToken` as `Authorization: Bearer <token>` on every
subsequent call. Both `disburse-loan` and `verify-trader` implement this.

## Webhooks (used by `monnify-webhook`)

- Header: `monnify-signature`
- **Signature scheme (confirmed from Monnify's own docs — this is NOT
  HMAC):**
  ```
  hash = SHA-512(clientSecretKey + rawRequestBodyJson)
  ```
  i.e. concatenate the secret key directly in front of the raw JSON body
  string, then take a plain SHA-512 digest, hex-encoded. Compare against
  the header value.
- **Event type string — NOT independently confirmed.** Monnify's static
  docs list the event category as "Successful Collection" but don't expose
  the literal `eventType` string value anywhere fetchable. The code
  currently checks for `"SUCCESSFUL_TRANSACTION"` based on convention from
  other Monnify integrations, but **you must confirm this against your own
  sandbox webhook logs** (log `payload.eventType` on the first real
  transaction and adjust the check in `monnify-webhook/index.ts` if it
  doesn't match).
- Best practice per Monnify: acknowledge with `200` before doing slow work,
  and treat webhook retries as expected (dedupe on `monnify_tx_ref`, which
  `monnify-webhook` already does via a unique constraint + 23505 catch).

## Disbursement — Single Transfer (used by `disburse-loan`)

```
POST {base}/api/v2/disbursements/single
Authorization: Bearer <token>

{
  "amount": 40000,
  "reference": "NOMAD-LOAN-<uuid>",
  "narration": "...",
  "destinationBankCode": "035",
  "destinationAccountNumber": "...",
  "currency": "NGN",
  "sourceAccountNumber": "<your wallet account>",
  "async": true
}
```

**MFA/OTP is enabled by default on every disbursement wallet, sandbox
included.** If it's still enabled, the response comes back with
`status: "PENDING_AUTHORIZATION"` instead of completing — the transfer
will not go through headlessly. `disburse-loan` detects this and returns a
`202` with a warning rather than silently reporting success.

**Action required before demo day:** email
`integration-support@monnify.com` asking them to disable MFA on your
sandbox disbursement wallet (see the drafted email from earlier in this
project — subject: "Request: Disable OTP/MFA on Sandbox Disbursement
Wallet"). Turnaround isn't instant, so send this early.

Other operational notes from Monnify's docs:
- Disbursements are enabled by default in Sandbox but disabled by default
  in Live — Live requires activation via the same support email.
- Live environment also enforces IP whitelisting for disbursement calls;
  sandbox does not appear to.

## Verification (used by `verify-trader`)

**Only Name Enquiry works in Sandbox.** Everything else in Monnify's
Verification API family — BVN/Account Match, BVN Details Match, NIN
Verification — is Live-only and cost-per-call. Building the demo around
any of those will silently fail in sandbox.

Name Enquiry (Validate Bank Account):
```
GET {base}/api/v1/disbursements/account/validate?accountNumber=...&bankCode=...
Authorization: Bearer <token>

→ { "responseBody": { "accountNumber": "...", "accountName": "...", "bankCode": "..." } }
```

This confirms the account number resolves to a real account name — it is
**not** an identity/BVN match. `verify-trader` stores the result under
`profiles.verification_ref` as `NAME_ENQUIRY:<account>:<bankCode>`,
deliberately distinct from `bvn_verified` (which stays `false` throughout
the hackathon build — don't wire a "BVN verified" badge into the UI until
you're on Live with BVN match actually callable).

## Things worth re-verifying against live sandbox logs before the demo

1. The exact `eventType` string in the webhook payload.
2. The exact shape of `eventData` for a successful collection — the webhook
   code assumes `data.product.reference` for the account reference and
   `data.transactionReference` / `data.amountPaid` / `data.paidOn`, based on
   patterns from other Monnify integrations, not a directly fetched sample
   payload. Log the raw payload once and adjust `monnify-webhook/index.ts`
   if any field names differ.
