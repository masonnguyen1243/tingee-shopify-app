# Implementation Plan — Tingee Payment App

Tracks remaining work by phase. Check off tasks as they are completed.

---

## Phase 2 — Backend

### Database

- [ ] Add `MerchantConfig` model to `prisma/schema.prisma`:
  - `shop` (String, unique), `clientId`, `secretKey`, `bankAccountId`, `accountNumber`, `bankBin`
- [ ] Add `Transaction` model to `prisma/schema.prisma`:
  - `transactionCode` (String, unique), `orderId`, `shop`, `amount`, `status` (PENDING/PAID/UNMATCHED), `rawPayload`, `createdAt`
- [ ] Run `prisma migrate dev` to apply schema changes

### shopify.app.toml cleanup

- [ ] Update `scopes` to `write_orders,read_orders` (remove template product/metaobject scopes)
- [ ] Remove template `[product.metafields.*]` and `[metaobjects.*]` blocks
- [ ] Set `application_url` to actual deployment URL (update after deploy)

### Tingee API client

- [ ] Create `app/lib/tingee.server.ts`:
  - `buildHeaders(clientId, secretKey, body)` — computes `x-request-timestamp` and `x-signature` (HMAC-SHA512)
  - `verifyWebhookSignature(headers, body, secretKey)` — validates incoming IPN
  - `getBanks(clientId, secretKey)` — calls `GET /v1/get-banks`
  - `getVirtualAccounts(clientId, secretKey, opts?)` — calls `POST /v1/get-va-paging`
  - `generateVietQR(clientId, secretKey, bankBin, accountNumber, amount, content)` — calls `POST /v1/generate-viet-qr`, returns `qrCodeImage` (base64)

### Shopify Admin API client

- [ ] Create `app/lib/shopify-admin.server.ts`:
  - `getOrder(admin, orderId)` — `GET /admin/api/2024-07/orders/{id}.json` — verify order exists and get total price
  - `markOrderPaid(admin, orderId, amount, currency)` — `POST /admin/api/2024-07/orders/{id}/transactions.json`

### Settings API routes

- [ ] Create `app/routes/api.settings.get-banks.tsx` — `GET` — calls `getBanks()`, returns bank list; requires admin auth
- [ ] Create `app/routes/api.settings.get-va-paging.tsx` — `POST` — calls `getVirtualAccounts()`; requires admin auth
- [ ] Create `app/routes/api.settings.save.tsx` — `POST` — validates credentials, saves `MerchantConfig` to DB; requires admin auth

### Payment API route

- [ ] Create `app/routes/api.payment.create-qr.tsx`:
  - `POST` with `{ orderId, amount, currency, shop }`
  - Loads `MerchantConfig` for `shop` from DB
  - Calls `generateVietQR()` with `content = "SHOPIFY{orderId}"`
  - Returns `{ qrCodeImage }` (base64 PNG)
  - Secure: validate `shop` origin / CORS header matches known store domain

- [ ] Create `app/routes/api.payment.status.tsx`:
  - `GET ?orderId=X&shop=Y`
  - Looks up `Transaction` table, returns `{ status }`

### Tingee IPN webhook

- [ ] Create `app/routes/webhook.tingee.tsx`:
  - `POST` — public endpoint (no Shopify auth)
  - Verify `x-signature` using the shop's `secretKey` from DB (look up by `vaAccountNumber` or pre-registered shop mapping)
  - Parse `content` field: extract `orderId` from `SHOPIFY{orderId}` pattern
  - Idempotency check: if `transactionCode` already in `Transaction` table → return `{"code":"00","message":"Success"}` immediately
  - Verify amount matches order total via `getOrder()`
  - Call `markOrderPaid()`
  - Write `Transaction` row with status `PAID`
  - Return `{"code":"00","message":"Success"}` with HTTP 200
  - On any failure: log full headers + body, write `Transaction` row with status `UNMATCHED`, still return HTTP 200

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
- [ ] Remove `app/routes/app.additional.tsx` (or repurpose as transaction log page)

---

## Phase 4 — Checkout UI Extension

- [ ] Scaffold: `shopify app generate extension` → choose `checkout_ui_extension`
- [ ] Implement `extensions/checkout-ui/src/Checkout.tsx`:
  - On mount: call `api.payment.create-qr` with `useOrder()` id, `useTotalAmount()`, `useShop()` domain
  - Loading state: show `<Spinner>`
  - QR ready: show `<Image src={qrCodeImage}>` + amount text + instruction banner
  - Polling: call `api.payment.status` every 3 s (max 15 min); on PAID → show success banner + stop polling
  - Error state: show error banner with retry button
- [ ] Register extension target in `shopify.app.toml` (e.g., `purchase.checkout.payment-method.render`)
- [ ] Set CORS origin in payment API routes to allow requests from `*.myshopify.com`

---

## Phase 5 — Deploy & Test

- [ ] Choose hosting provider (Railway or Render recommended)
- [ ] Set up PostgreSQL database, update `prisma/schema.prisma` datasource to `postgresql`
- [ ] Configure production env vars on host (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `DATABASE_URL`)
- [ ] Update `shopify.app.toml`: `application_url`, `redirect_urls`
- [ ] Run `shopify app deploy` to push config + extension
- [ ] End-to-end test on Shopify development store:
  - Install flow
  - Settings save (valid and invalid credentials)
  - Checkout QR display
  - Simulate Tingee IPN → order marked paid
  - Duplicate IPN idempotency check
  - Uninstall cleanup

---

## Phase 6 — App Store

- [ ] Write app listing: name, description (EN + VI), key benefits
- [ ] Create screenshots / demo video
- [ ] Write privacy policy and data handling disclosure
- [ ] Complete Shopify App Review checklist (https://shopify.dev/docs/apps/launch/app-review/checklist)
- [ ] Submit for review
- [ ] Address any review feedback
- [ ] Publish
