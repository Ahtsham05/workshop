# Subscription Billing (v2)

How Logix Plus charges organizations: plans stored in the database, card payments through
**Polar** (merchant of record), and manual **bank / JazzCash / Easypaisa** payments for Pakistani
businesses, all writing to one entitlement record that the whole API enforces.

---

## 1. How it fits together

```
          Pakistani org (countryCode = PK)                Everyone else
          ─────────────────────────────────              ─────────────
 manual:  reference + locked PKR quote → proof upload     Polar hosted checkout
          → platform admin approves ──────┐               → verified webhook ──┐
                                          ▼                                    ▼
                       services/billing/subscriptionWriter.js (the only writer)
                                          ▼
                          Organization.subscription  (single source of truth)
                                          ▼
               services/entitlement.service.js  (every access question)
                 ├─ middlewares/entitlement.js  → readOnlyGate / requireModule / requireQuota
                 └─ invoice / user / branch / membership services assert on their own
```

* **Routing follows the organization's country, never IP.** It is the same country set in
  Settings → Business Profile / Localization (`Organization.countryCode`); billing has no separate
  country. `PK` → manual (PKR) by default, card optional. Anything else → card only. No country set →
  the billing page links to Business Profile.
* **The browser never confirms a payment.** Card access changes only come from signature-verified
  webhooks (or Polar API responses fetched server-to-server); manual access only from admin approval.
* **Access is resolved from dates on every request** (`subscriptionState.resolveState`). The
  scheduler persists transitions and sends emails, but a missed scheduler run can never grant
  or deny access by itself.
* **Lapsed ≠ locked out.** Read-only mode blocks creating or changing records (HTTP 402
  `SUBSCRIPTION_READ_ONLY`). Viewing, exporting, profile changes and paying always keep working.

### Status lifecycle

| Status | Meaning | Access |
|---|---|---|
| `trialing` | Free trial (default 14 days) | full |
| `active` | Paid through `currentPeriodEnd` | full |
| `canceled` | Polar sub set to cancel at period end | full until period end → `expired` (no grace) |
| `pastDue` | Polar renewal failed, Polar is retrying | full until `periodEnd + graceDays` |
| `gracePeriod` | Period ended, not renewed yet (default 5 days) | full until `graceEndsAt` |
| `expired` | Trial / plan lapsed | **read-only** |

Trials and cancellations get no grace period. Manual plans never renew automatically.

### Plan changes

| Change | Card (Polar) | Manual |
|---|---|---|
| Upgrade | Immediate; Polar invoices the prorated difference | On approval, immediate; unused days of the old plan are converted to extra days at the new plan's price |
| Downgrade | Scheduled by Polar (`next_period`) and mirrored as `pendingPlanType` | Current plan runs to its end, then the lower plan runs for the paid months |
| Renewal | Automatic | Extends from the current period end (from the old end if paid during grace) |

Before a downgrade the UI calls `/billing/plan-change/preview` and lists any usage above the lower
plan's limits. Nothing is deleted after a downgrade. The customer just can't add more until usage
is back under the limit.

### Limits and modules

`Plan` documents hold `limits` (`maxUsers`, `maxBranches`, `maxInvoicesPerMonth`; `-1` = unlimited)
and `modules`. Counting rules:

* **Users:** active staff logins. Student/parent portal logins are not counted.
* **Branches:** active branches.
* **Invoices:** created this calendar month in Pakistan time. Quotations, drafts and trial demo data are not counted.

Legacy feature keys used by ~60 routes (`repair`, `school_management`, …) map to modules in
`server/src/config/billing.js` → `FEATURE_TO_MODULE`. Mirror any change there in
`client/src/lib/feature-access.ts`. A module missing from a plan blocks writes. Reads stay open for
data modules (the org's own records), and stay closed for computed ones (advanced reports, analytics).

---

## 2. Setup

### Server

1. Install: `cd server && npm install` (adds `@polar-sh/sdk` and `zod`).
2. Add to `server/.env` (see `.env.example` → "Subscription billing"):
   ```
   POLAR_ACCESS_TOKEN=...        # sandbox token first
   POLAR_WEBHOOK_SECRET=...
   POLAR_SERVER=sandbox
   BILLING_CRON_SECRET=          # optional, for hosts without a long-running process
   BILLING_SCHEDULER_ENABLED=true
   ```
   `FRONTEND_URL` must be the app's public URL. It builds the checkout return URLs and the email links.
3. Seed plans and the settings document (safe to re-run; never overwrites your edits):
   `node src/scripts/billing/seedPlans.js`
4. Create/link the Polar products (idempotent; reuses products tagged `metadata.planKey`):
   `node src/scripts/billing/createPolarProducts.js --dry-run`, then without `--dry-run`.
5. Migrate existing organizations (dry run prints a before→after summary; `--apply` writes):
   `node src/scripts/billing/migrateSubscriptions.js` then `... --apply`.
   It aliases `single`→`starter` and `multi`→`growth`, copies `endDate` into `currentPeriodEnd`, and
   stores today's resolved status so the first scheduler run doesn't email long-lapsed accounts.

> These scripts use `MONGODB_URL`. Point it at the database you mean to change.

### Editing prices, limits, bank details, exchange rate

System Admin → **Plans & Settings** tab (or `PATCH /v1/billing/admin/plans/:key` and
`/v1/billing/admin/settings`). Changes reach every server within ~30 s (in-process cache). A new
exchange rate only affects new payment references; quotes already given keep their locked rate.
Changing a USD price in the app does **not** change the Polar product, so update it in Polar too
(`createPolarProducts.js` warns when they differ).

### Scheduler

Runs in-process every 15 min: applies due manual downgrades, persists grace/read-only
transitions, sends 7-day and 3-day reminders (and trial-ending reminders), and retries failed webhooks.
Several processes can run it at once safely, because each email is claimed atomically. On a host
without a long-running process, set `BILLING_SCHEDULER_ENABLED=false` and call
`POST /v1/billing/cron/run` with header `x-cron-secret: $BILLING_CRON_SECRET` every 15 min.

---

## 3. Polar dashboard configuration

1. **Products.** One monthly recurring product per paid plan, created by
   `createPolarProducts.js` (sandbox: Starter, Growth and Business already exist and are tagged). The
   product ids are stored on each plan (`polar.sandboxProductId` / `polar.productionProductId`).
2. **Webhook endpoint.** Settings → Webhooks → Add endpoint:
   * URL: `https://<your-api-host>/v1/billing/polar/webhook`
     (production API today: `https://workshop-qxya.onrender.com/v1/billing/polar/webhook`)
   * Format: **Raw**
   * Events: `subscription.created`, `subscription.updated`, `subscription.active`,
     `subscription.canceled`, `subscription.uncanceled`, `subscription.past_due`,
     `subscription.revoked`, `order.paid`
   * Copy the signing secret into `POLAR_WEBHOOK_SECRET`.
3. **Customer portal.** Enabled by default. Customers reach it from Billing → "Manage card & invoices".
4. **Local testing.** Polar can't reach `localhost`. Expose the API with a tunnel
   (`cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`) and use the tunnel URL for a
   sandbox webhook endpoint. Sandbox test card: `4242 4242 4242 4242`, any future date, any CVC.

### What the webhook does

The raw body is read before `express.json` (see `app.js`), so the signature check runs on the
exact bytes Polar signed:

1. Bad or missing signature → **403**, nothing stored.
2. The event is stored in `WebhookEvent`, keyed by its `webhook-id`. A redelivery → **202 `duplicate: true`**, not reprocessed.
3. It's processed inline. On success → `processed`. Unknown product or foreign subscription → `ignored`.
4. If processing fails → stored as `failed` and **still 202**. The scheduler retries it (up to 8 attempts).
5. Events are applied in version order (`modifiedAt`). An older state never overwrites a newer one.

---

## 4. Sandbox → production checklist

- [ ] Create the production Polar organization (payout account, tax details, business verification).
- [ ] New **production** access token → `POLAR_ACCESS_TOKEN`; set `POLAR_SERVER=production`.
- [ ] Run `createPolarProducts.js` with the production token (fills `polar.productionProductId`).
      Check the prices match the plans.
- [ ] Add the production webhook endpoint (section 3) and set `POLAR_WEBHOOK_SECRET` to its secret.
- [ ] `FRONTEND_URL` = the production app URL (checkout success/return URLs and email links).
- [ ] SMTP configured (`SMTP_*`, `EMAIL_FROM`). Receipts, rejections and reminders depend on it.
- [ ] Real bank / JazzCash / Easypaisa details and the current PKR rate in System Admin → Plans & Settings.
- [ ] Run `migrateSubscriptions.js` (dry run, review, then `--apply`) against the production DB.
- [ ] Confirm exactly one scheduler is expected (in-process, or cron with `BILLING_SCHEDULER_ENABLED=false`).
- [ ] Buy one plan end-to-end with a real card, then refund it in Polar; approve one small manual payment.
- [ ] Rotate the sandbox token (it is only for testing and expires 26 Sep 2027).

---

## 5. How to test each part

| Part | Automated | By hand |
|---|---|---|
| Entitlements & state machine | `npx jest tests/unit/services/subscriptionState.test.js tests/integration/entitlement.test.js` | Set an org's `subscription.currentPeriodEnd` into the past → try to add a customer (402) and open the customer list (works) |
| Polar webhooks & checkout | `npx jest tests/integration/billing.test.js -t "Polar"` | Sandbox checkout with test card → org becomes active within seconds; cancel in the portal → "Cancels at period end" |
| Manual flow & admin queue | `npx jest tests/integration/billing.test.js -t "Manual payments"` | Billing → Renew → submit proof → System Admin → Manual Payments → Approve → receipt email |
| Scheduler | `npx jest tests/integration/billing.test.js -t "Billing scheduler"` | `POST /v1/billing/cron/run` with the secret after moving dates |

The whole billing suite: `npx jest tests/integration/billing.test.js tests/integration/entitlement.test.js tests/unit/services/subscriptionState.test.js`.

---

## 6. Edge cases to test manually

**Payments**
1. Pay by card, then close the tab on Polar's success page before redirect: the plan still activates (webhook).
2. Press back on the Polar checkout: the billing page says "Checkout canceled — nothing was charged".
3. Card renewal fails (sandbox declining card): status goes `pastDue`, the banner shows the grace date, then read-only.
4. Cancel in the customer portal: stays usable until period end, then read-only. Resubscribe afterwards: works.
5. Owner with an email Polar rejects: checkout still opens and asks for the email.
6. Submit the same JazzCash transaction ID twice (also with different spacing or case): the second is refused.
7. The same transaction number on a different method (bank vs Easypaisa): allowed.
8. Reject a claim, then resubmit the same transaction ID: allowed.
9. Submit a PDF, a HEIC photo (refused), a 6 MB file (refused), and a renamed `.txt` → `.png` (refused).
10. Wait past the quote's validity (default 72 h) before submitting: "reference expired", get a new one.
11. Change the exchange rate after a reference is issued: the old reference keeps its amount.
12. Customer pays less than quoted: the admin sees the mismatch in red before approving.
13. Two admins approve the same payment at once: one wins, the other gets "already approved".
14. Manual payment while a card subscription is active: refused (prevents double billing).

**Plan changes**

15. Upgrade Starter → Growth by manual payment with 10 days left: Growth applies now, with extra days credited.
16. Downgrade Business → Starter with 5 users: warning shown, Business kept until period end, then Starter; existing users keep working, and adding a 6th is refused.
17. Pay during a trial: the paid period starts after the remaining trial days.
18. Renew during the grace period: the new period continues from the old end date.

**Lapsed accounts**

19. Read-only account: lists, reports, exports and invoice printing all work; create/edit/delete returns the renewal message; profile and appearance settings still save; the Billing page works.
20. Desktop (Electron) app in read-only: offline sales are refused by the server but stay on the device (Settings → Sync shows them as failed) and retry automatically. After renewal, check the sync dashboard for dead-letter items and retry them.
21. Student/parent portal logins: no billing banner; they don't count toward the user limit.
22. Invoice limit reached mid-month: new invoices are refused, quotations still work; the count resets on the 1st (Pakistan time).
23. Non-owner staff open Billing: they see the plan and usage, with no pay buttons.

---

## 7. API reference

Customer (JWT). Reads are open to any org member. Everything that pays or changes plans is **owner-only**.

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/billing/summary` | plan, status, mode, usage, routing, plans with PKR prices |
| POST | `/v1/billing/plan-change/preview` | `{ planKey }` → direction, effectiveAt, warnings |
| POST | `/v1/billing/polar/checkout` | `{ planKey }` → `{ url }` (rate limited) |
| POST | `/v1/billing/polar/portal` | → `{ url }` |
| POST | `/v1/billing/polar/change-plan` | `{ planKey }` for an existing card subscription |
| POST | `/v1/billing/manual/intents` | `{ planKey, months }` → reference, amount, account details (rate limited) |
| POST | `/v1/billing/manual/payments` | multipart: `reference, method, transactionId, payerName, paidAmountPkr, paidOn, proof` (rate limited) |
| GET | `/v1/billing/manual/payments` | own history |

Platform admin (`system_admin`): `GET/POST /v1/billing/admin/manual-payments[/:id[/approve|/reject]]`,
`GET/PATCH /v1/billing/admin/settings`, `GET /v1/billing/admin/plans`, `PATCH /v1/billing/admin/plans/:key`,
`PATCH /v1/billing/admin/organizations/:orgId/subscription` (audited override),
`GET /v1/billing/admin/audit`.

Unauthenticated: `POST /v1/billing/polar/webhook` (signature), `POST /v1/billing/cron/run` (secret).

Errors keep the app's `{ code, message }` shape and add `errorCode` + `details` for billing denials:
`SUBSCRIPTION_READ_ONLY` (402), `MODULE_NOT_IN_PLAN`, `LIMIT_USERS`, `LIMIT_BRANCHES`,
`LIMIT_INVOICES`, `NOT_ORG_OWNER` (403), `DUPLICATE_TRANSACTION`, `REFERENCE_USED`,
`POLAR_SUBSCRIPTION_EXISTS`, `ALREADY_REVIEWED` (409), `REFERENCE_EXPIRED` (410),
`VALIDATION_FAILED` (400), `RATE_LIMITED` (429).

---

## 8. Files

Server: `config/billing.js` · `models/{plan,billingSettings,manualPayment,manualPaymentIntent,webhookEvent,billingAudit}.model.js`
· `services/entitlement.service.js` · `services/billing/*` · `middlewares/{entitlement,validateZod}.js`
· `routes/v1/billing.route.js` · `controllers/billing.controller.js` · `validations/billing.validation.js`
· `jobs/billingScheduler.js` · `scripts/billing/*`.

Client: `stores/billing.api.ts` · `features/settings/billing/*` · `features/admin/billing/*`
· `components/trial-expiration-boundary.tsx` (banners) · `hooks/use-{feature-access,plan-limits}.ts` · `lib/feature-access.ts`.
