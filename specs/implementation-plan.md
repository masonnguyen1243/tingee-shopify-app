# Implementation Plan — Tingee Payment App

Tracks remaining work by phase. Check off tasks as they are completed.

---

## Phase 1 — Scaffold (done)

- [x] Shopify OAuth 2.0 install flow
- [x] Session storage in SQLite via Prisma (`Session` model)
- [x] Embedded admin app shell (App Bridge, Polaris web components)
- [x] Webhook handlers: `app/uninstalled`, `app/scopes_update`
- [x] `shopify.app.toml` base config

---

## Phase 2 — Backend

### Database

- [x] Add `MerchantConfig` model to `prisma/schema.prisma`:
  - `shop` (String, unique), `clientId`, `secretKey`, `bankAccountId`, `accountNumber`, `bankBin`
- [x] Add `Transaction` model to `prisma/schema.prisma`:
  - `transactionCode` (String, unique, nullable — set when IPN arrives), `orderId`, `shop`, `amount`, `vaAccountNumber`, `status` (PENDING / PAID / EXPIRED / UNMATCHED), `rawPayload`, `createdAt`, `updatedAt`
- [x] Run `prisma migrate dev` to apply schema changes

### shopify.app.toml cleanup

- [x] Update `scopes` to `write_orders,read_orders` (remove template product/metaobject scopes)
- [x] Remove template `[product.metafields.*]` and `[metaobjects.*]` blocks
- [x] Set `application_url` to actual deployment URL (update after deploy)

### Tingee API client

- [x] Create `app/lib/tingee.server.ts`:
  - `buildHeaders(clientId, secretKey, body)` — computes `x-request-timestamp` and `x-signature` (HMAC-SHA512)
  - `verifyWebhookSignature(headers, body, secretKey)` — validates incoming IPN
  - `getBanks(clientId, secretKey)` — calls `GET /v1/get-banks`
  - `getVirtualAccounts(clientId, secretKey, opts?)` — calls `POST /v1/get-va-paging`
  - `generateVietQR(clientId, secretKey, bankBin, accountNumber, amount, content)` — calls `POST /v1/generate-viet-qr`, returns `qrCodeImage` (base64)

### Shopify Admin API client

- [x] Create `app/lib/shopify-admin.server.ts`:
  - `getOrder(admin, orderId)` — `GET /admin/api/2026-07/orders/{id}.json` — verify order exists and get total price
  - `markOrderPaid(admin, orderId, amount, currency)` — `POST /admin/api/2026-07/orders/{id}/transactions.json`

### Settings API routes

- [x] Create `app/routes/api.settings.get-banks.tsx` — `GET` — calls `getBanks()`, returns bank list; requires admin auth
- [x] Create `app/routes/api.settings.get-va-paging.tsx` — `POST` — calls `getVirtualAccounts()`; requires admin auth
- [x] Create `app/routes/api.settings.save.tsx` — `POST` — validates credentials, saves `MerchantConfig` to DB; requires admin auth

### Payment API routes

- [x] Create `app/routes/api.payment.create-qr.tsx`:
  - `POST` with `{ orderId, amount, currency, shop }`
  - Loads `MerchantConfig` for `shop` from DB
  - Calls `generateVietQR()` with `content = "SHOPIFY{orderId}"`
  - **Creates a `Transaction` row with status `PENDING`, storing `shop`, `orderId`, `amount`, and `vaAccountNumber`** — this is required so the IPN handler can later look up which shop a payment belongs to
  - Returns `{ qrCodeImage }` (base64 PNG)
  - Set CORS `Access-Control-Allow-Origin` to `*.myshopify.com`

- [x] Create `app/routes/api.payment.status.tsx`:
  - `GET ?orderId=X&shop=Y`
  - Looks up `Transaction` table by `orderId` + `shop`, returns `{ status }`
  - Returns `EXPIRED` if Transaction is PENDING and `createdAt` is older than 15 minutes
  - Set CORS header same as above

### Tingee IPN webhook

- [ ] Create `app/routes/webhook.tingee.tsx`:
  - `POST` — public endpoint (no Shopify auth)
  - Look up `shop` by matching `vaAccountNumber` in the `Transaction` table — this is the only way to identify the shop from an IPN request
  - Load the shop's `secretKey` from `MerchantConfig` and verify `x-signature` using HMAC-SHA512; return HTTP 400 if invalid
  - Idempotency check: if `transactionCode` already exists in `Transaction` table → return `{"code":"00","message":"Success"}` immediately
  - Parse `content` field: extract `orderId` from `"SHOPIFY{orderId}"` pattern
  - Verify amount matches order total via `getOrder()`
  - Call `markOrderPaid()`
  - Update `Transaction` row: set status `PAID`, set `transactionCode`, set `rawPayload`
  - Return `{"code":"00","message":"Success"}` with HTTP 200
  - On any failure: log full headers + body, write/update `Transaction` row with status `UNMATCHED`, still return HTTP 200

---

## Phase 3 — Settings UI

- [ ] Create `app/routes/app.settings.tsx`:
  - Form with `x-client-id` and `x-secret-key` fields
  - "Kiểm tra & Lấy danh sách" button — calls `api.settings.get-banks` and `api.settings.get-va-paging`, shows bank list and VA dropdown
  - Error banner if credentials invalid or no linked accounts
  - "Lưu cấu hình" button — calls `api.settings.save`
  - Success/error toast feedback
- [ ] Add "Cài đặt" nav link in `app/routes/app.tsx` (`<s-link href="/app/settings">`)
- [ ] Replace placeholder content in `app/routes/app._index.tsx` with a Tingee dashboard (config status, recent transactions, quick-start guide)
- [ ] Remove `app/routes/app.additional.tsx` and replace with `app/routes/app.transactions.tsx` — a simple transaction log table (orderId, amount, status, createdAt)
- [ ] Add "Lịch sử giao dịch" nav link in `app/routes/app.tsx`

---

## Phase 4 — Checkout UI Extension

- [ ] Scaffold: `shopify app generate extension` → choose `checkout_ui_extension`
- [ ] Implement `extensions/checkout-ui/src/Checkout.tsx`:
  - On mount: call `api.payment.create-qr` with `useOrder()` id, `useTotalAmount()`, `useShop()` domain
  - Loading state: show `<Spinner>`
  - QR ready: show `<Image src={qrCodeImage}>` + amount text + instruction banner
  - Polling: call `api.payment.status` every 3 s (max 15 min); on `PAID` → show success banner + stop polling
  - On `EXPIRED`: show "QR code đã hết hạn" message with retry button that calls `create-qr` again
  - Error state: show error banner with retry button
- [ ] Register extension target in `shopify.app.toml` (e.g., `purchase.checkout.payment-method.render`)

---

## Phase 5 — Deploy & Test

### Deploy

- [ ] Choose hosting provider (Railway or Render recommended)
- [ ] Set up PostgreSQL database, update `prisma/schema.prisma` datasource to `postgresql`
- [ ] Configure production env vars on host (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `DATABASE_URL`)
- [ ] **Run `prisma migrate deploy` on production DB before first start**
- [ ] Update `shopify.app.toml`: `application_url`, `redirect_urls`
- [ ] Run `shopify app deploy` to push config + extension

### End-to-end testing

- [ ] Install flow on Shopify development store
- [ ] Settings save — test valid and invalid credentials
- [ ] Checkout QR display
- [ ] Simulate Tingee IPN:
  - Use the tunnel URL (from `shopify app dev`) or ngrok so Tingee can reach the local `/webhook/tingee` endpoint
  - Alternatively: use `curl` or Postman to POST a signed IPN payload with correct `x-signature` header
- [ ] Verify order is marked paid in Shopify Admin after IPN
- [ ] Send duplicate IPN with same `transactionCode` → confirm idempotency (order not double-paid)
- [ ] Wait 15+ minutes after QR generation → confirm status returns `EXPIRED`
- [ ] Uninstall app → confirm session deleted from DB

---

## Phase 6 — App Store

- [ ] Write app listing: name, description (EN + VI), key benefits
- [ ] Create screenshots / demo video
- [ ] Write privacy policy and data handling disclosure
- [ ] Complete Shopify App Review checklist (https://shopify.dev/docs/apps/launch/app-review/checklist)
- [ ] Submit for review
- [ ] Address any review feedback
- [ ] Publish
