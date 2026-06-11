import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { generateVietQR } from "../lib/tingee.server";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const ALLOWED_ORIGINS = /^https:\/\/([\w-]+\.myshopify\.com|checkout\.shopify\.com|extensions\.shopifycdn\.com)/;

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.test(origin) ? origin : "https://www.myshopify.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// Handle CORS preflight
export const loader = async ({ request }: ActionFunctionArgs) => {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const cors = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const body = await request.json().catch(() => null);
  const { orderId, amount, currency: _currency, shop } = (body ?? {}) as {
    orderId?: string;
    amount?: number;
    currency?: string;
    shop?: string;
  };

  const numericAmount = Number(amount);
  if (!orderId || !numericAmount || !shop) {
    return Response.json(
      { error: "orderId, amount, and shop are required" },
      { status: 400, headers: cors }
    );
  }

  const config = await db.merchantConfig.findUnique({ where: { shop } });
  if (!config) {
    return Response.json(
      { error: "Shop not configured" },
      { status: 404, headers: cors }
    );
  }

  // Cancel any PENDING transactions older than 15 minutes for this order
  await db.transaction.updateMany({
    where: {
      orderId,
      shop,
      status: "PENDING",
      createdAt: { lt: new Date(Date.now() - FIFTEEN_MINUTES_MS) },
    },
    data: { status: "EXPIRED" },
  });

  const content = `SHOPIFY${orderId}`;
  const qrCodeImage = await generateVietQR(
    config.clientId,
    config.secretKey,
    config.bankBin,
    config.bankAccountId,
    numericAmount,
    content
  );
  console.log("[tingee] qrCodeImage prefix:", qrCodeImage?.slice(0, 80));

  await db.transaction.create({
    data: {
      orderId,
      shop,
      amount: numericAmount,
      vaAccountNumber: config.bankAccountId,
      status: "PENDING",
    },
  });

  return Response.json({ qrCodeImage }, { headers: cors });
};
