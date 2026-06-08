# Change Log

Record significant changes here as they are made. Most recent entry at the top.

Format: `## YYYY-MM-DD — <summary>`

---

## 2026-06-06 — Phase 2 Database: add MerchantConfig and Transaction models

Added two Prisma models to `prisma/schema.prisma`:

- **MerchantConfig** — stores per-shop Tingee credentials (`clientId`, `secretKey`, `bankAccountId`, `accountNumber`, `bankBin`). Unique on `shop` so each merchant has one config row.
- **Transaction** — tracks each QR payment lifecycle. `transactionCode` is nullable (set on IPN arrival) and unique for idempotency. `status` is a string enum: `PENDING`, `PAID`, `EXPIRED`, `UNMATCHED`.

Migration `20260606043149_add_merchant_config_and_transaction` applied to `prisma/dev.sqlite`. Prisma Client regenerated.

## 2026-06-06 — Phase 2 shopify.app.toml cleanup

- Updated `scopes` from template values (`write_products,write_metaobjects,write_metaobject_definitions`) to `write_orders,read_orders` — the only scopes needed for the payment app.
- Removed template `[product.metafields.app.demo_info]` and `[metaobjects.app.example]` blocks (and all sub-sections) that were scaffolded by the Shopify CLI template but are irrelevant to this app.
- `application_url` remains `https://example.com` as a placeholder; will be updated once a production host is chosen (Phase 5).

## 2026-06-06 — Phase 2 Backend: Tingee API client

Created `app/lib/tingee.server.ts` — server-only module for all Tingee API interactions:

- **`buildHeaders(clientId, secretKey, body)`** — generates the three required auth headers for every outgoing request: `x-client-id`, `x-request-timestamp` (UTC+7, `yyyyMMddHHmmssSSS`), and `x-signature` (HMAC-SHA512 over `timestamp:JSON.stringify(body)`).
- **`verifyWebhookSignature(timestamp, rawBody, receivedSignature, secretKey)`** — validates incoming IPN requests using the same HMAC formula with timing-safe comparison.
- **`getBanks(clientId, secretKey)`** — `GET /v1/get-banks`, returns `Bank[]`.
- **`getVirtualAccounts(clientId, secretKey, opts?)`** — `POST /v1/get-va-paging` with pagination, returns `{ items: VirtualAccount[]; total: number }`.
- **`generateVietQR(clientId, secretKey, bankBin, accountNumber, amount, content)`** — `POST /v1/generate-viet-qr`, returns `qrCodeImage` as base64 string.

Uses Node.js built-in `node:crypto` (no extra dependencies). TypeScript types clean — `npm run typecheck` passes.

## 2026-06-06 — Phase 2 Backend: Shopify Admin API client

Created `app/lib/shopify-admin.server.ts` — server-only module cho tương tác với Shopify Admin API:

- **`getOrder(admin, orderId)`** — GraphQL query `order(id)`, trả về `{ id, totalPrice, currency }`. Chấp nhận orderId dạng số (`"123456"`) hoặc GID đầy đủ; tự động convert sang `gid://shopify/Order/{id}`.
- **`markOrderPaid(admin, orderId, _amount, _currency)`** — GraphQL mutation `orderMarkAsPaid`, throw nếu `userErrors` không rỗng.

**Lưu ý triển khai:** SDK `@shopify/shopify-app-react-router` chỉ expose GraphQL client (`admin.graphql`), không có REST client. Cả `authenticate.admin()` và `unauthenticated.admin()` đều trả về cùng type `AdminApiContext`, nên hàm này dùng được cho cả route có auth (Settings) lẫn IPN webhook (public). TypeScript type check sạch.

## 2026-06-06 — Phase 2 Backend: Settings API routes

Tạo 3 route endpoint phục vụ Settings UI (Phase 3):

- **`app/routes/api.settings.get-banks.tsx`** — `GET /api/settings/get-banks?clientId=X&secretKey=Y` — xác thực admin Shopify, gọi `getBanks()` với credentials từ query params, trả về `{ banks: Bank[] }`. Trả 400 nếu thiếu params hoặc credentials không hợp lệ.
- **`app/routes/api.settings.get-va-paging.tsx`** — `POST /api/settings/get-va-paging` với body `{ clientId, secretKey, page?, size? }` — gọi `getVirtualAccounts()`, trả về `{ items: VirtualAccount[], total }`.
- **`app/routes/api.settings.save.tsx`** — `POST /api/settings/save` với body `{ clientId, secretKey, bankAccountId, accountNumber, bankBin }` — validate credentials bằng cách gọi `getBanks()` trước, sau đó upsert `MerchantConfig` scoped theo `session.shop`. Đảm bảo multi-tenancy: mỗi shop có một config riêng.

Cả 3 route đều yêu cầu `authenticate.admin(request)`. TypeScript type check sạch.

## 2026-06-08 — Phase 2 Backend: Payment API routes

Tạo 2 route endpoint phục vụ Checkout UI Extension:

- **`app/routes/api.payment.create-qr.tsx`** — `POST /api/payment/create-qr` với body `{ orderId, amount, currency, shop }`:
  - Load `MerchantConfig` từ DB theo `shop`; trả 404 nếu chưa cấu hình.
  - Hủy các `Transaction` PENDING quá 15 phút của cùng order (đánh dấu EXPIRED) trước khi tạo mới.
  - Gọi `generateVietQR()` với `content = "SHOPIFY{orderId}"`.
  - Tạo row `Transaction` mới với `status = PENDING`, lưu `vaAccountNumber = config.accountNumber` (để IPN handler tra cứu sau).
  - Trả về `{ qrCodeImage }` (base64 PNG).
  - CORS: reflect origin nếu `*.myshopify.com`, fallback về `https://www.myshopify.com`.

- **`app/routes/api.payment.status.tsx`** — `GET /api/payment/status?orderId=X&shop=Y`:
  - Tra cứu Transaction mới nhất theo `orderId + shop`.
  - Tự động trả `EXPIRED` nếu status là `PENDING` và `createdAt` cách đây > 15 phút (không update DB — logic đọc thuần túy).
  - Trả `NOT_FOUND` nếu không có row nào.
  - CORS header giống create-qr.

Cả hai endpoint đều **public** (không yêu cầu Shopify admin auth) — bảo vệ bằng CORS origin validation thay vì session token.

<!-- Add entries below this line -->
