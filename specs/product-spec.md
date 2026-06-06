# Product Spec — Tingee Payment App

---

## App Goal

Enable Shopify merchants in Vietnam to accept bank-transfer payments via QR code at checkout, powered by the Tingee VietQR gateway. Customers scan a QR code, transfer money from their banking app, and the order is automatically marked paid — no manual reconciliation required.

---

## Target Users

| User | Description |
|---|---|
| **Merchant** | Vietnamese Shopify store owner with a Tingee partner account. Installs the app, enters their Tingee credentials, and starts accepting QR payments. |
| **Customer** | End buyer who chooses "Pay by QR code" at checkout and completes payment from any Vietnamese banking app. |

---

## Core User Flow

### Merchant setup (once)
1. Merchant installs the app from the Shopify App Store → OAuth redirects to Shopify Admin.
2. Merchant opens the **Settings** page, enters their Tingee `Client ID` and `Secret Key`, and selects their bank account.
3. Merchant saves settings → app validates credentials with Tingee API → confirmation shown.

### Customer payment (every order)
1. Customer reaches Shopify checkout and selects **"Pay by QR / VietQR"** as payment method.
2. Checkout UI Extension calls the app's `/api/payment/create-qr` endpoint, which generates a VietQR code via Tingee API.
3. QR code is displayed in the checkout. Customer scans and transfers the exact order amount from their banking app.
4. Extension polls `/api/payment/status` every 3 seconds (up to 15 minutes).
5. Tingee sends an IPN webhook to `/webhook/tingee` when payment is confirmed → app marks the Shopify order as paid via Admin API.
6. Checkout UI Extension detects the paid status and advances the customer to the order confirmation page.

---

## Features In Scope

- **OAuth install flow** — Shopify OAuth 2.0, session storage in database.
- **Merchant settings page** — form to enter/update Tingee credentials and select bank account; credentials stored per-shop in DB.
- **QR code generation** — `/api/payment/create-qr` calls Tingee API with HMAC-signed request, returns QR image/data to the checkout extension.
- **Payment status polling** — `/api/payment/status` endpoint checked by the checkout extension every 3 s.
- **Tingee IPN receiver** — `/webhook/tingee` verifies HMAC signature, marks order paid in Shopify, responds `{"code":"00","message":"Success"}`.
- **Checkout UI Extension** — displays the QR code, countdown timer, and polls for payment confirmation.
- **Transaction log** — DB table recording each payment attempt, status, and Tingee `transactionCode` (used for idempotency).
- **Uninstall cleanup** — webhook deletes the shop's session and credentials on uninstall.

---

## Features Out of Scope

- Refunds or partial captures via Tingee API.
- Support for payment methods other than VietQR bank transfer.
- Multi-currency or non-VND transactions.
- Mobile app or standalone (non-Shopify) checkout.
- Merchant-facing analytics or reporting dashboard.
- Automated retry or reconciliation for failed/expired QR sessions.
- Support for Shopify POS.

---

## Acceptance Criteria

### Merchant settings
- [ ] Merchant can enter and save Tingee `Client ID` and `Secret Key`.
- [ ] App validates credentials against Tingee API before saving; shows a clear error if invalid.
- [ ] Credentials are stored per-shop and never exposed in client-side code.
- [ ] Merchant can update credentials at any time.

### QR payment flow
- [ ] Checkout displays a VietQR code with the correct amount and order reference.
- [ ] QR code contains `content = "SHOPIFY{orderId}"` so the IPN handler can resolve the order.
- [ ] Checkout extension polls for status and automatically advances to confirmation when payment is detected — no manual page refresh required.
- [ ] If the customer does not pay within 15 minutes, the QR session expires and an appropriate message is shown.

### IPN & order fulfillment
- [ ] Tingee IPN HMAC signature is verified before processing; invalid requests return HTTP 400.
- [ ] A `transactionCode` received more than once is ignored (idempotent).
- [ ] On a valid IPN, the Shopify order is marked paid via Admin API within 5 seconds of the webhook arriving.
- [ ] IPN handler always responds HTTP 200 with `{"code":"00","message":"Success"}` after processing.

### Reliability & security
- [ ] All DB queries are scoped to `session.shop`; no cross-merchant data leakage.
- [ ] Tingee HMAC signing uses `HMAC_SHA512(timestamp + ":" + JSON.stringify(body), secretKey)`.
- [ ] App passes Shopify's built-in webhook verification for `app/uninstalled`.
- [ ] No Tingee credentials are logged or exposed in error responses.
