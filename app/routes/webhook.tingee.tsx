import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { verifyWebhookSignature } from "../lib/tingee.server";

const SUCCESS = { code: "00", message: "Success" };

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-request-timestamp") ?? "";
  const signature = request.headers.get("x-signature") ?? "";

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error("[Tingee IPN] Invalid JSON body:", rawBody);
    return Response.json(SUCCESS);
  }

  // accountNumber in IPN body is the real bank account number → look up shop by accountNumber
  const vaAccountNumber = (body.accountNumber as string | undefined) ?? "";
  if (!vaAccountNumber) {
    console.error("[Tingee IPN] Missing accountNumber in payload:", rawBody);
    return Response.json(SUCCESS);
  }

  // Identify the shop via MerchantConfig.accountNumber (real bank account sent by Tingee in IPN)
  const config = await db.merchantConfig.findFirst({
    where: { accountNumber: vaAccountNumber },
  });
  if (!config) {
    console.error(`[Tingee IPN] No MerchantConfig for accountNumber: ${vaAccountNumber}`);
    return Response.json(SUCCESS);
  }

  // Verify HMAC-SHA512 signature; reject invalid requests
  if (!verifyWebhookSignature(timestamp, rawBody, signature, config.secretKey)) {
    console.error("[Tingee IPN] Invalid signature for shop:", config.shop);
    return new Response("Invalid signature", { status: 400 });
  }

  const transactionCode = (body.transactionCode as string | undefined) ?? "";
  const shop = config.shop;

  // Idempotency: Tingee retries up to 5 times — skip if already processed
  if (transactionCode) {
    const existing = await db.transaction.findUnique({ where: { transactionCode } });
    if (existing) {
      return Response.json(SUCCESS);
    }
  }

  // Parse orderId from content "SHOPIFY{orderId}"
  const content = (body.content as string | undefined) ?? "";
  const orderIdMatch = content.match(/^SHOPIFY(.+)$/);
  if (!orderIdMatch) {
    console.error("[Tingee IPN] Cannot parse orderId from content:", content, {
      headers: Object.fromEntries(request.headers),
      body: rawBody,
    });
    await saveUnmatched(vaAccountNumber, shop, body, transactionCode, rawBody);
    return Response.json(SUCCESS);
  }

  const orderId = orderIdMatch[1];
  const amount = typeof body.amount === "number" ? body.amount : parseFloat(String(body.amount ?? "0"));

  // At IPN time, the Shopify order may not exist yet (customer pays before placing order).
  // Mark transaction PAID so the checkout extension polling can detect it and show success.
  // The actual Shopify order will be marked paid via the orders/create webhook once placed.
  const pendingTx = await db.transaction.findFirst({
    where: { orderId, shop, status: { in: ["PENDING", "UNMATCHED"] } },
    orderBy: { createdAt: "desc" },
  });

  if (pendingTx) {
    await db.transaction.update({
      where: { id: pendingTx.id },
      data: {
        status: "PAID",
        transactionCode: transactionCode || null,
        rawPayload: rawBody,
      },
    });
  } else {
    await db.transaction.create({
      data: {
        orderId,
        shop,
        amount,
        vaAccountNumber,
        status: "PAID",
        transactionCode: transactionCode || null,
        rawPayload: rawBody,
      },
    });
  }

  console.log(`[Tingee IPN] Payment recorded — orderId: ${orderId}, amount: ${amount}, shop: ${shop}`);
  return Response.json(SUCCESS);
};

async function saveUnmatched(
  vaAccountNumber: string,
  shop: string,
  body: Record<string, unknown>,
  transactionCode: string,
  rawBody: string,
  orderId?: string,
  amount?: number
): Promise<void> {
  if (orderId) {
    const pendingTx = await db.transaction.findFirst({
      where: { orderId, shop, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (pendingTx) {
      await db.transaction.update({
        where: { id: pendingTx.id },
        data: { status: "UNMATCHED", rawPayload: rawBody },
      });
      return;
    }
  }

  // No existing transaction found — create a new UNMATCHED record
  await db.transaction.create({
    data: {
      orderId: orderId ?? (body.content as string | undefined) ?? "UNKNOWN",
      shop,
      amount: amount ?? 0,
      vaAccountNumber,
      status: "UNMATCHED",
      transactionCode: transactionCode || null,
      rawPayload: rawBody,
    },
  });
}
