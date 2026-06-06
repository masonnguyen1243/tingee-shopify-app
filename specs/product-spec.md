# Product Spec — Tingee Payment App (current state)

> This document describes what the app **currently does** as of June 2026.
> See [implementation-plan.md](implementation-plan.md) for what remains to be built.

---

## What the app is

A Shopify embedded app that will integrate the Tingee VietQR payment gateway into Shopify checkout. Merchants install the app, enter their Tingee credentials, and their customers can pay by scanning a QR code during checkout.

---

## What is currently implemented

### 1. Shopify OAuth & session management

The app handles the full Shopify OAuth 2.0 install flow:

- Merchant visits the install URL → redirected through Shopify OAuth → access token exchanged.
- Sessions (offline tokens) are persisted in SQLite via Prisma (`Session` model).
- Session storage is handled by `@shopify/shopify-app-session-storage-prisma`.
- Session expiry and refresh-token fields are modelled in the schema.

Relevant files: [app/shopify.server.ts](../app/shopify.server.ts), [app/db.server.ts](../app/db.server.ts), [prisma/schema.prisma](../prisma/schema.prisma)

### 2. Embedded admin app shell

A two-page embedded admin app (served inside the Shopify Admin iframe via App Bridge):

- **Home page** (`/app`) — currently shows the default Shopify CLI scaffold: a "Generate a product" demo that calls Shopify Admin GraphQL to create a product with metafields and a metaobject. This content is placeholder and will be replaced.
- **Additional page** (`/app/additional`) — placeholder page demonstrating multi-page navigation.
- Navigation rendered via `<s-app-nav>` (Polaris web component).

Relevant files: [app/routes/app.tsx](../app/routes/app.tsx), [app/routes/app._index.tsx](../app/routes/app._index.tsx), [app/routes/app.additional.tsx](../app/routes/app.additional.tsx)

### 3. Shopify webhook handlers

Two webhook subscriptions registered in `shopify.app.toml` and handled by route files:

| Topic | Handler | Action |
|---|---|---|
| `app/uninstalled` | `webhooks.app.uninstalled.tsx` | Deletes the shop's offline session from DB |
| `app/scopes_update` | `webhooks.app.scopes_update.tsx` | No-op acknowledgement |

### 4. App configuration

`shopify.app.toml` contains the app's Shopify config:

- Client ID: `ed9bd15a90a8d007b3c038a507ca0190`
- Embedded: true
- API version: `2026-07`
- Scopes: `write_products, write_metaobjects, write_metaobject_definitions` *(placeholder — needs updating)*
- `application_url`: `https://example.com` *(placeholder — not yet set to real host)*

### 5. Database schema

Single model `Session` (Shopify's required session storage). No Tingee-specific tables exist yet.

---

## What is NOT yet implemented

- Tingee API client (HMAC signing, QR generation, bank/VA fetching)
- Merchant settings page (credentials form, bank account selector)
- Settings API endpoints (`/api/settings/*`)
- Payment endpoint (`/api/payment/create-qr`)
- Payment status polling endpoint (`/api/payment/status`)
- Tingee IPN webhook receiver (`/webhook/tingee`)
- Shopify Admin API call to mark orders paid
- Checkout UI Extension (QR display + polling in storefront checkout)
- DB models for merchant config and transaction log
- Correct scopes (`write_orders`, `read_orders`)
- Production hosting configuration
