# Change Log

Record significant changes here as they are made. Most recent entry at the top.

Format: `## YYYY-MM-DD — <summary>`

---

## 2026-06-10 — Phase 4 Checkout UI Extension

Triển khai Phase 4 — Checkout UI Extension cho phép khách hàng quét mã VietQR ngay trong trang checkout:

- **`extensions/checkout-ui/package.json`** — Khai báo package cho extension workspace với dependency `@shopify/ui-extensions@^2025.7.4`.

- **`extensions/checkout-ui/shopify.extension.toml`** — Config extension: target `purchase.checkout.block.render`, bật `network_access` để extension có thể gọi backend API.

- **`extensions/checkout-ui/tsconfig.json`** — TypeScript config cho extension.

- **`extensions/checkout-ui/src/Checkout.ts`** — Implementation đầy đủ:
  - Mount → gọi `POST /api/payment/create-qr` với `checkoutToken` (dùng làm orderId), tổng tiền từ `api.cost.totalAmount`, shop domain từ `api.shop.myshopifyDomain`.
  - State `loading` → hiển thị `Spinner` + text.
  - State `ready` → hiển thị `Banner` hướng dẫn + `Image` QR code (base64 PNG) + số tiền + ghi chú nội dung CK.
  - Polling mỗi 3 giây (tối đa 15 phút) gọi `GET /api/payment/status`. Khi `PAID` → chuyển sang banner thành công và dừng poll.
  - State `expired` → banner cảnh báo + nút "Tạo mã QR mới".
  - State `error` → banner lỗi + nút "Thử lại".
  - Dùng state machine pattern với `root.replaceChildren()` để re-render.

- **`shopify.app.toml`** — Đăng ký extension `[[extensions]]` với target `purchase.checkout.block.render`.

**Ghi chú:** App URL được inject qua `process.env.SHOPIFY_APP_URL` lúc build (Shopify CLI tự inject khi chạy `shopify app dev`).

---

## 2026-06-09 — Dev server fixes

Khắc phục 3 vấn đề khiến `pnpm dev` không load được app trong Shopify Admin:

- **`vite.config.ts`** — Thêm `host: true` vào `server` config. Vite mặc định chỉ bind trên `::1` (IPv6), trong khi Shopify CLI proxy kết nối qua `127.0.0.1` (IPv4), dẫn đến ECONNREFUSED qua tunnel. `host: true` khiến Vite bind trên `0.0.0.0` (tất cả interfaces).

- **`shopify.web.toml`** — Đơn giản hóa lệnh `dev` từ `npx prisma migrate deploy && npm exec react-router dev` xuống còn `npm exec react-router dev`. Prisma generate + migrate mất ~35 giây, nhưng Shopify CLI proxy đã sẵn sàng sau ~2 giây — dẫn đến race condition: proxy nhận request trước khi Vite khởi xong. Migration chỉ cần chạy một lần khi schema thay đổi, không cần chạy mỗi lần dev start.

- **`.env`** — Tạo file `.env` với `DATABASE_URL="file:./dev.sqlite"` (bị gitignore, phải tạo thủ công).

**Kết quả:** App load thành công trong Shopify Admin, hiển thị dashboard "Tổng quan Tingee".

---

## 2026-06-08 — Phase 3 Settings UI

Triển khai toàn bộ Phase 3 — UI cho admin embedded app:

- **`app/routes/app.settings.tsx`** — Trang cài đặt Tingee với form nhập `clientId`/`secretKey`, nút "Kiểm tra & Lấy danh sách" gọi song song `api.settings.get-banks` và `api.settings.get-va-paging`, dropdown `s-select` chọn tài khoản ảo, nút "Lưu cấu hình" POST đến `api.settings.save`. Hiển thị banner success nếu đã cấu hình; banner lỗi nếu credentials không hợp lệ; toast notification sau khi lưu.

- **`app/routes/app._index.tsx`** (thay thế) — Dashboard Tingee: banner trạng thái cấu hình (warning nếu chưa cấu hình, success nếu đã cấu hình), bảng 5 giao dịch gần nhất, hướng dẫn nhanh.

- **`app/routes/app.transactions.tsx`** (mới, thay thế `app.additional.tsx`) — Trang lịch sử giao dịch với bảng Polaris (`s-table`, `s-table-row`, `s-badge` với tone theo trạng thái), pagination đơn giản 20 rows/trang.

- **`app/routes/app.tsx`** — Cập nhật nav: "Tổng quan", "Cài đặt", "Lịch sử giao dịch" (bỏ "Additional page").

- **`app/routes/app.additional.tsx`** — Xóa (thay bằng transactions).

- **`.react-router/types/`** — Regenerate type files qua `react-router typegen` để phản ánh routes mới.

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

## 2026-06-08 — Phase 2 Backend: Tingee IPN webhook handler

Tạo `app/routes/webhook.tingee.tsx` — endpoint public nhận IPN (Instant Payment Notification) từ Tingee:

**Flow xử lý:**
1. Đọc raw body (để verify HMAC) và parse JSON.
2. Dùng `accountNumber` từ payload để tra cứu `MerchantConfig` (VA account number của merchant).
3. Xác minh `x-signature` bằng `verifyWebhookSignature()` (HMAC-SHA512). Trả HTTP 400 nếu sai — đây là trường hợp duy nhất không trả 200.
4. Kiểm tra idempotency: nếu `transactionCode` đã tồn tại trong DB → trả success ngay, không xử lý lại.
5. Parse `orderId` từ `content` field theo pattern `SHOPIFY{orderId}`.
6. Dùng `unauthenticated.admin(shop)` để lấy Shopify Admin API context cho shop đó.
7. Gọi `getOrder()` để verify order tồn tại và kiểm tra amount khớp (tolerance 1 đơn vị tiền tệ).
8. Gọi `markOrderPaid()` để đánh dấu order đã thanh toán trong Shopify.
9. Cập nhật row `Transaction` PENDING gần nhất: set `status = PAID`, `transactionCode`, `rawPayload`.
10. Trả `{"code":"00","message":"Success"}` với HTTP 200.

**Xử lý lỗi:** Mọi exception đều log đầy đủ (headers + body) và update Transaction sang `UNMATCHED`. Vẫn trả HTTP 200 để Tingee không retry vô hạn. Nếu không tìm được Transaction PENDING phù hợp, tạo row `UNMATCHED` mới.

Helper `saveUnmatched()` xử lý cả hai case: cập nhật row PENDING có sẵn hoặc tạo mới khi không tìm được.

TypeScript type check sạch — không có dependency mới.

<!-- Add entries below this line -->

## 2026-06-11 — Fix: 3 lỗi khiến app không load được trong Shopify Admin (dev)

**Lỗi 1: `ECONNREFUSED 127.0.0.1:<port>`**

- **Nguyên nhân:** `shopify.web.toml` dùng `npm exec react-router dev` nhưng project dùng pnpm. `npm exec` không tìm được binary `react-router` trong pnpm workspace → Vite không khởi động → Shopify CLI proxy không có gì để forward đến.
- **Fix — `shopify.web.toml`:** Đổi `dev = "npm exec react-router dev"` → `dev = "pnpm exec react-router dev"`.

**Lỗi 2: `*.trycloudflare.com refused to connect`**

- **Nguyên nhân:** Vite 6 có tính năng bảo mật `allowedHosts` — chỉ accept request có `Host` header khớp với hostname trong `SHOPIFY_APP_URL`. Cloudflare tunnel tạo URL ngẫu nhiên mới mỗi lần restart (`shopify app dev`), URL này thay đổi trước khi Vite đọc được env var → Vite reject toàn bộ request từ tunnel → browser thấy "refused to connect".
- **Fix — `vite.config.ts`:** Đổi `allowedHosts: [host]` → `allowedHosts: true`. An toàn cho dev vì production dùng `react-router-serve`, không qua Vite server.

**Lỗi 3: Blank page trong Shopify Admin iframe**

- **Nguyên nhân:** `root.tsx` thiếu `addDocumentResponseHeaders`, dẫn đến HTML document response không có header `Content-Security-Policy: frame-ancestors`. Shopify Admin nhúng app qua iframe — browser block iframe nếu thiếu header này.
- **Fix — `app/root.tsx`:** Thêm loader gọi `addDocumentResponseHeaders(request, headers)` và return `data(null, { headers })` để header được đính vào response thực sự.

## 2026-06-10 — Fix: VirtualAccount interface sai so với Tingee API thực tế

**Lỗi:** Trang Cài đặt trả về `400 All fields are required` khi nhấn "Lưu cấu hình".

**Nguyên nhân gốc:** `VirtualAccount` interface trong `app/lib/tingee.server.ts` khai báo field `bankAccountId: string`, nhưng Tingee API thực tế không trả về field này. Thay vào đó, API trả về:
- `vaAccountNumber` — số tài khoản ảo (e.g. `"V1T60430114208"`)
- `bankName`, `accountType`, `status` — các field bổ sung

Vì `bankAccountId` không có trong response → `JSON.stringify` bỏ qua `undefined` → server nhận body thiếu field → validation `!bankAccountId` → 400.

**Các file đã sửa:**

- **`app/lib/tingee.server.ts`** — Cập nhật `VirtualAccount` interface: xóa `bankAccountId`, thêm `vaAccountNumber`, `bankName`, `accountType?`, `status?`.

- **`app/routes/app.settings.tsx`** — Thay toàn bộ `selectedBankAccountId` → `selectedVaAccountNumber`; dùng `va.vaAccountNumber` làm key/value cho `s-option`; trong `handleSave()` map `bankAccountId: va.vaAccountNumber` (lưu VA number vào cột `bankAccountId` của DB — không cần migration).

**Ghi chú:** Cột `bankAccountId` trong Prisma schema giữ nguyên tên; chỉ thay đổi giá trị được lưu vào đó (từ "bankAccountId không tồn tại" sang `vaAccountNumber` thực tế). Không cần `prisma migrate`.

---

## 2026-06-10 — Fix: Vite SSR deadlock do CSS Module import

**Lỗi:** `transport invoke timed out after 60000ms` — app không load được trong Shopify Admin.

**Nguyên nhân gốc:** Bug của Vite 6.4.3 + React Router 7: `SSRCompatModuleRunner.fetchModule` bị deadlock khi load CSS Module trong SSR context. File `app/routes/_index/route.tsx` có `import styles from "./styles.module.css"` trigger bug này.

**File đã sửa:**

- **`app/routes/_index/route.tsx`** — Xóa `import styles from "./styles.module.css"`, thay tất cả `className={styles.xxx}` bằng inline `style={{...}}`. File CSS module vẫn còn trong thư mục nhưng không được import.

**Lý do an toàn:** Route `_index` là trang login scaffold — chỉ hiện khi truy cập app URL trực tiếp không có `?shop=` param. Trong luồng embedded app bình thường, loader redirect ngay sang `/app?shop=...`, trang này không bao giờ render.
