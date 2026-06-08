import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed =
    origin.endsWith(".myshopify.com") ? origin : "https://www.myshopify.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cors = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  const shop = url.searchParams.get("shop");

  if (!orderId || !shop) {
    return Response.json(
      { error: "orderId and shop are required" },
      { status: 400, headers: cors }
    );
  }

  const tx = await db.transaction.findFirst({
    where: { orderId, shop },
    orderBy: { createdAt: "desc" },
  });

  if (!tx) {
    return Response.json({ status: "NOT_FOUND" }, { headers: cors });
  }

  let status = tx.status;
  if (
    status === "PENDING" &&
    Date.now() - tx.createdAt.getTime() > FIFTEEN_MINUTES_MS
  ) {
    status = "EXPIRED";
  }

  return Response.json({ status }, { headers: cors });
};
