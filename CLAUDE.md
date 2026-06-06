# CLAUDE.md — Tingee Payment App

## Agent rules

- **Read specs first.** Before writing any code, read `specs/product-spec.md` and `specs/implementation-plan.md`.
- **One phase/task at a time.** Implement only the task currently in scope. Do not jump ahead.
- **Keep it simple.** No extra libraries, no extra abstractions, no features beyond what the spec says.
- **Do not change architecture** unless the spec is explicitly updated first.
- **After each implementation:** update `specs/change-log.md` with what was done.
- **After each implementation:** explain how to test the change (commands to run, what to verify).

---

## Project overview

Shopify embedded app that integrates the Tingee payment gateway, letting customers pay by scanning a VietQR bank-transfer QR code during checkout. Targets the Shopify App Store.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js >= 20 |
| Framework | React Router v7 (file-based routing, SSR via Vite) |
| Language | TypeScript |
| Shopify integration | `@shopify/shopify-app-react-router` (OAuth, session, webhooks) |
| Admin UI components | Polaris web components (`<s-page>`, `<s-section>`, `<s-button>`, …) |
| Database ORM | Prisma |
| Database (dev) | SQLite (`prisma/dev.sqlite`) |
| Database (prod) | PostgreSQL (swap `datasource` in `prisma/schema.prisma`) |
| Build tool | Vite |
| Shopify CLI | v3 — `shopify app dev` |

---

## Project layout

```
tingee-payment-app/
├── app/
│   ├── shopify.server.ts       # shopifyApp() config — OAuth, session storage
│   ├── db.server.ts            # Prisma client singleton
│   ├── routes/
│   │   ├── app.tsx             # Authenticated layout (nav, AppProvider wrapper)
│   │   ├── app._index.tsx      # Admin home page
│   │   ├── app.settings.tsx    # Merchant settings page (to be built)
│   │   ├── auth.$.tsx          # OAuth callback (managed by Shopify CLI)
│   │   ├── auth.login/         # Login page
│   │   ├── webhooks.app.uninstalled.tsx
│   │   ├── webhooks.app.scopes_update.tsx
│   │   ├── api.settings.tsx    # REST endpoints for settings (to be built)
│   │   ├── api.payment.create-qr.tsx  # QR generation endpoint (to be built)
│   │   └── webhook.tingee.tsx  # Tingee IPN receiver (to be built)
│   └── lib/
│       ├── tingee.server.ts    # Tingee API client + HMAC helper (to be built)
│       └── shopify-admin.server.ts  # Mark order paid via Admin API (to be built)
├── extensions/
│   └── checkout-ui/            # Checkout UI Extension (to be built)
│       └── src/Checkout.tsx
├── prisma/
│   └── schema.prisma
├── shopify.app.toml
└── package.json
```

---

## Routing conventions

- **Admin routes** — files named `app.*.tsx` under `app/routes/`. All require `authenticate.admin(request)` at the top of every loader and action.
- **API routes** — files named `api.*.tsx`. Called by the Checkout UI Extension; use `authenticate.public.checkout(request)` (unauthenticated public endpoints protected by CORS/shop verification instead).
- **Webhook routes** — files named `webhooks.*.tsx` (Shopify webhooks) or `webhook.tingee.tsx` (Tingee IPN). Shopify webhooks use `authenticate.webhook(request)`; Tingee IPN uses manual HMAC-SHA512 verification.
- **Server-only modules** — suffix `.server.ts`; never imported by client bundles.

---

## Authentication pattern

Every admin loader/action must start with:

```ts
const { admin, session } = await authenticate.admin(request);
```

`session.shop` is the `myshopify.com` domain — use it as the multi-tenant key when reading/writing DB rows.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `SHOPIFY_API_KEY` | Shopify app client ID |
| `SHOPIFY_API_SECRET` | Shopify app secret |
| `SHOPIFY_APP_URL` | Public HTTPS URL of the app (tunnel URL in dev) |
| `SCOPES` | Comma-separated Shopify scopes |
| `DATABASE_URL` | Prisma DB connection string (SQLite path or PostgreSQL URL) |

In dev, Shopify CLI injects `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, and `SHOPIFY_APP_URL` automatically — you only need `DATABASE_URL` in `.env`.

Merchant-specific Tingee credentials (`x-client-id`, `x-secret-key`) are stored per-shop in the database, **not** in env vars.

---

## How to run (development)

```bash
npm install
npm run dev        # starts Vite + Shopify CLI tunnel, opens partner dashboard URL
```

On first run, the CLI will prompt you to log in to Shopify Partners and select a development store.

```bash
# Apply DB migrations (if schema changed)
npm run setup      # runs: prisma generate && prisma migrate deploy

# Type-check
npm run typecheck

# Lint
npm run lint
```

---

## Tingee API

**Base URL:** `https://open-api.tingee.vn`

Every request requires three headers computed in `app/lib/tingee.server.ts`:

| Header | Value |
|---|---|
| `x-client-id` | Merchant's Tingee partner ID |
| `x-request-timestamp` | `yyyyMMddHHmmssSSS` format, UTC+7 |
| `x-signature` | `HMAC_SHA512(timestamp + ":" + JSON.stringify(body), secretKey)` |

Tingee IPN (webhook) verification uses the same HMAC formula applied to the incoming request body + its `x-request-timestamp` header. Always respond `{"code":"00","message":"Success"}` with HTTP 200.

---

## Key implementation notes

- **Idempotency**: check `transactionCode` in the `Transaction` table before marking an order paid — Tingee retries up to 5 times.
- **Order content format**: QR `content` field is set to `SHOPIFY{orderId}`; webhook handler parses this to find the order.
- **Polling**: Checkout UI Extension polls `/api/payment/status?orderId=X` every 3 s for up to 15 min.
- **Multi-tenancy**: every DB query is scoped to `session.shop`; never use a single global credential.
