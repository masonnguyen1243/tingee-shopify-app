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

<!-- Add entries below this line -->
