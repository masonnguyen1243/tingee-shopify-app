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

<!-- Add entries below this line -->
